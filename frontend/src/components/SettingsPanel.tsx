import { useState, useEffect, useRef } from "react";
import { Modal, Input, Button, Segmented, message, Typography, Popconfirm, Space, Spin, Select } from "antd";
import { Trash2, Upload as UploadIcon, Save, Eraser, Eye, EyeOff } from "lucide-react";
import type { Character, Live2DModelInfo, PresetModel } from "../api";
import { getModels, getPresetModels, uploadModel, deleteModel, updateCharacter, clearConversation } from "../api";

const { Text, Title } = Typography;

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  character: Character | null;
  onCharacterUpdated: (char: Character) => void;
  onMemoryCleared: () => void;
}

const DEFAULT_MODEL_URL = "/live2d/icegirl/IceGirl.model3.json";

const TEMPLATE_OPTIONS = [
  { label: "玉子（推荐）", value: "yuko" },
  { label: "自定义", value: "custom" },
];

export default function SettingsPanel({
  open,
  onClose,
  character,
  onCharacterUpdated,
  onMemoryCleared,
}: SettingsPanelProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("yuko");
  const [custom, setCustom] = useState("");
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL);
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
  const [presetModels, setPresetModels] = useState<PresetModel[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelName, setModelName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // API 配置
  const [apiProvider, setApiProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [apiModel, setApiModel] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open && character) {
      setName(character.name);
      setTemplate(character.personalityTemplate);
      setCustom(character.customPersonality);
      setModelUrl(character.modelUrl);
      setApiProvider((character as any).apiProvider || "deepseek");
      setApiKey((character as any).apiKey || "");
      setApiModel((character as any).apiModel || "");
      setApiUrl((character as any).apiUrl || "");
      setShowKey(false);
      loadModels();
    }
  }, [open, character]);

  const loadModels = async () => {
    const [list, presets] = await Promise.all([getModels(), getPresetModels()]);
    setModels(list);
    setPresetModels(presets);
  };

  const handleSave = async () => {
    if (!character) return;
    setSaving(true);
    try {
      const updated = await updateCharacter(character.id, {
        name: name.trim() || "玉子",
        personalityTemplate: template,
        customPersonality: custom,
        modelUrl,
        apiProvider,
        apiKey: apiKey.trim(),
        apiModel: apiModel.trim(),
        apiUrl: apiUrl.trim(),
      } as any);
      onCharacterUpdated(updated);
      message.success("保存成功");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleClearMemory = async () => {
    if (!character) return;
    try {
      await clearConversation(character.id);
      onMemoryCleared();
      message.success("记忆已清空");
      onClose();
    } catch {
      message.error("清空记忆失败");
    }
  };

  const handleUpload = async () => {
    fileInputRef.current?.click();
  };

  const handleDeleteModel = async (modelId: string, mName: string) => {
    try {
      await deleteModel(modelId);
      await loadModels();
      message.success(`已删除模型：${mName}`);
    } catch (err) {
      message.error(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadModel(file, modelName);
      message.success(`上传成功：${result.name}`);
      await loadModels();
      setModelUrl(result.modelUrl);
      setModelName("");
    } catch (err) {
      message.error(`上传失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isCustom = template === "custom";

  return (
    <Modal
      open={open && !!character}
      onCancel={onClose}
      title={<Title level={4} style={{ margin: 0 }}>角色设置</Title>}
      width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Popconfirm
            title="清空聊天记忆"
            description="确定要清空和她的所有聊天记忆吗？此操作不可恢复。"
            onConfirm={handleClearMemory}
            okText="确定"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<Eraser size={14} />}>
              清空记忆
            </Button>
          </Popconfirm>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" icon={<Save size={14} />} loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Space>
        </div>
      }
    >
      {/* 名字 */}
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ display: "block", marginBottom: 8 }}>名字</Text>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="给她起个名字吧"
          maxLength={20}
          size="large"
        />
      </div>

      {/* 性格模板 */}
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ display: "block", marginBottom: 8 }}>性格模板</Text>
        <Segmented
          value={template}
          onChange={(v) => setTemplate(v as string)}
          options={TEMPLATE_OPTIONS}
          block
        />
      </div>

      {/* 自定义性格 */}
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ display: "block", marginBottom: 8 }}>
          {isCustom ? "自定义性格描述" : "补充性格描述（可选）"}
        </Text>
        <Input.TextArea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={
            isCustom
              ? "完全自定义她的性格，比如：\n喜欢猫、有点小迷糊、说话带着撒娇的语气、偶尔毒舌但心很软、对甜食没有抵抗力…"
              : '描述你想要的额外性格特点，比如"喜欢猫、有点小迷糊"等'
          }
          rows={isCustom ? 5 : 3}
          maxLength={isCustom ? 300 : 200}
          showCount
        />
        {isCustom && (
          <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
            自定义模式下，以上描述将作为她的全部性格特征
          </Text>
        )}
      </div>

      {/* 模型选择 */}
      <div>
        <Text strong style={{ display: "block", marginBottom: 8 }}>角色形象</Text>

        {/* 预置模型 */}
        {presetModels.length > 0 && (
          <div className="model-grid">
            {presetModels.map((m) => (
              <button
                key={m.id}
                className={`model-card ${modelUrl === m.modelUrl ? "active" : ""}`}
                onClick={() => setModelUrl(m.modelUrl)}
                title={m.name}
              >
                <span className="model-card-avatar">{m.name.charAt(0)}</span>
                <span className="model-card-name">{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* 已上传模型 */}
        {models.length > 0 && (
          <>
            <Text type="secondary" style={{ fontSize: 12, margin: "12px 0 8px", display: "block" }}>
              已上传模型
            </Text>
            <div className="model-grid">
              {models.map((m) => (
                <div
                  key={m.id}
                  className={`model-card-wrapper ${modelUrl === m.modelUrl ? "active" : ""}`}
                >
                  <button
                    className={`model-card ${modelUrl === m.modelUrl ? "active" : ""}`}
                    onClick={() => setModelUrl(m.modelUrl)}
                    title={m.name}
                  >
                    <span className="model-card-avatar">{m.name.charAt(0)}</span>
                    <span className="model-card-name">{m.name}</span>
                  </button>
                  <button
                    className="model-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteModel(m.id, m.name);
                    }}
                    title={`删除模型：${m.name}`}
                  >
                    <Trash2 size={14} color="#e53935" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <Button
          icon={uploading ? <Spin size="small" /> : <UploadIcon size={14} />}
          onClick={handleUpload}
          disabled={uploading}
          style={{ marginTop: 12 }}
        >
          {uploading ? "上传中…" : "上传新模型"}
        </Button>
        <Input
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="模型显示名（可选，留空用文件名）"
          maxLength={20}
          style={{ marginTop: 8 }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.xz"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
          支持 ZIP/RAR/7Z/TAR/GZ 等格式，需包含 .model3.json 或 .model.json 文件
        </Text>
      </div>

      {/* AI 模型配置 */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #f0f0f0" }}>
        <Text strong style={{ display: "block", marginBottom: 12 }}>🔌 AI 模型配置（可选）</Text>
        <Text type="secondary" style={{ fontSize: 12, marginBottom: 12, display: "block" }}>
          不填则使用全局默认配置（.env）
        </Text>

        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, marginBottom: 4, display: "block" }}>服务商</Text>
          <Select
            value={apiProvider}
            onChange={(v) => setApiProvider(v)}
            style={{ width: "100%" }}
            options={[
              { label: "DeepSeek", value: "deepseek" },
              { label: "OpenAI", value: "openai" },
              { label: "自定义", value: "custom" },
            ]}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, marginBottom: 4, display: "block" }}>API Key</Text>
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="留空则使用全局配置"
            type={showKey ? "text" : "password"}
            suffix={
              <Button type="text" size="small" onClick={() => setShowKey(!showKey)} style={{ padding: 0 }}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            }
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, marginBottom: 4, display: "block" }}>模型名称</Text>
          <Input
            value={apiModel}
            onChange={(e) => setApiModel(e.target.value)}
            placeholder={apiProvider === "deepseek" ? "deepseek-chat" : apiProvider === "openai" ? "gpt-4o" : "自定义模型名"}
          />
        </div>

        {apiProvider === "custom" && (
          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, marginBottom: 4, display: "block" }}>API 地址</Text>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://your-api.com/v1/chat/completions"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
