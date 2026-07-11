import { useState, useEffect, useRef } from "react";
import type { Character, Live2DModelInfo, PresetModel } from "../api";
import { getModels, getPresetModels, uploadModel, deleteModel, updateCharacter, clearConversation } from "../api";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  character: Character | null;
  onCharacterUpdated: (char: Character) => void;
  onMemoryCleared: () => void;
}

const DEFAULT_MODEL_URL = "/live2d/icegirl/IceGirl.model3.json";

const TEMPLATE_LABELS: Record<string, string> = {
  gentle: "温柔",
  lively: "活泼",
  tsundere: "傲娇",
  intellectual: "知性",
  custom: "自定义",
};

export default function SettingsPanel({
  open,
  onClose,
  character,
  onCharacterUpdated,
  onMemoryCleared,
}: SettingsPanelProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("gentle");
  const [custom, setCustom] = useState("");
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL);
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
  const [presetModels, setPresetModels] = useState<PresetModel[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [modelName, setModelName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && character) {
      setName(character.name);
      setTemplate(character.personalityTemplate);
      setCustom(character.customPersonality);
      setModelUrl(character.modelUrl);
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
        name: name.trim() || "小念",
        personalityTemplate: template,
        customPersonality: custom,
        modelUrl,
      });
      onCharacterUpdated(updated);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleClearMemory = async () => {
    if (!character) return;
    if (!confirm("确定要清空和她的所有聊天记忆吗？此操作不可恢复。")) return;
    try {
      await clearConversation(character.id);
      onMemoryCleared();
      onClose();
    } catch {
      alert("清空记忆失败");
    }
  };

  const handleUpload = async () => {
    fileInputRef.current?.click();
  };

  // 删除已上传的模型
  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!confirm(`确定要删除模型「${modelName}」吗？此操作不可撤销。`)) return;
    try {
      await deleteModel(modelId);
      await loadModels();
      setUploadMsg(`已删除模型：${modelName}`);
    } catch (err) {
      setUploadMsg(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const result = await uploadModel(file, modelName);
      setUploadMsg(`上传成功：${result.name}`);
      await loadModels();
      setModelUrl(result.modelUrl);
      setModelName("");
    } catch (err) {
      setUploadMsg(`上传失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!open || !character) return null;

  const isCustom = template === "custom";

  return (
    <div className="settings-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>角色设置</h2>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          {/* 名字 */}
          <div className="settings-section">
            <label className="settings-label">名字</label>
            <input
              type="text"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给她起个名字吧"
              maxLength={20}
            />
          </div>

          {/* 性格模板 */}
          <div className="settings-section">
            <label className="settings-label">性格模板</label>
            <div className="template-grid">
              {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className={`template-btn ${template === key ? "active" : ""}`}
                  onClick={() => setTemplate(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 自定义性格 / 补充性格 */}
          {isCustom ? (
            <div className="settings-section">
              <label className="settings-label">自定义性格描述</label>
              <textarea
                className="settings-textarea"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={"完全自定义她的性格，比如：\n喜欢猫、有点小迷糊、说话带着撒娇的语气、偶尔毒舌但心很软、对甜食没有抵抗力…"}
                rows={5}
                maxLength={300}
              />
              <p className="upload-hint">
                自定义模式下，以上描述将作为她的全部性格特征
              </p>
            </div>
          ) : (
            <div className="settings-section">
              <label className="settings-label">补充性格描述（可选）</label>
              <textarea
                className="settings-textarea"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={'描述你想要的额外性格特点，比如\u201C喜欢猫、有点小迷糊\u201D等'}
                rows={3}
                maxLength={200}
              />
            </div>
          )}

          {/* 模型选择 */}
          <div className="settings-section">
            <label className="settings-label">角色形象</label>

            {/* 预置模型网格 */}
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
                <p className="model-section-label">已上传模型</p>
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "上传中…" : "上传新模型"}
            </button>
            <input
              type="text"
              className="settings-input model-name-input"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="模型显示名（可选，留空用文件名）"
              maxLength={20}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.xz"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {uploadMsg && <p className="upload-msg">{uploadMsg}</p>}
            <p className="upload-hint">
              支持 ZIP/RAR/7Z/TAR/GZ 等格式，需包含 .model3.json 或 .model.json 文件
            </p>
          </div>
        </div>

        <div className="settings-footer">
          <button
            className="settings-clear-btn"
            onClick={handleClearMemory}
            title="清空聊天记忆"
          >
            清空记忆
          </button>
          <button
            className="settings-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
