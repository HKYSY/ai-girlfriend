import { useState, useEffect, useRef } from "react";
import type { PersonaSettings, Live2DModelInfo } from "../api";
import { getModels, uploadModel } from "../api";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  persona: PersonaSettings;
  onPersonaChange: (p: PersonaSettings) => void;
  currentModelUrl: string;
  onModelChange: (url: string) => void;
}

const DEFAULT_MODEL_URL = "/live2d/haru/Haru.model3.json";

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
  persona,
  onPersonaChange,
  currentModelUrl,
  onModelChange,
}: SettingsPanelProps) {
  const [name, setName] = useState(persona.name);
  const [template, setTemplate] = useState(persona.personalityTemplate);
  const [custom, setCustom] = useState(persona.customPersonality);
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(persona.name);
      setTemplate(persona.personalityTemplate);
      setCustom(persona.customPersonality);
      loadModels();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadModels = async () => {
    const list = await getModels();
    setModels(list);
  };

  const handleSave = () => {
    onPersonaChange({
      name: name.trim() || "小念",
      personalityTemplate: template,
      customPersonality: custom,
    });
    onClose();
  };

  const handleUpload = async () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const result = await uploadModel(file);
      setUploadMsg(`上传成功：${result.name}`);
      await loadModels();
      onModelChange(result.modelUrl);
    } catch (err) {
      setUploadMsg(`上传失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!open) return null;

  const isCustom = template === "custom";

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
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
            <div className="model-list">
              <button
                className={`model-btn ${currentModelUrl === DEFAULT_MODEL_URL ? "active" : ""}`}
                onClick={() => onModelChange(DEFAULT_MODEL_URL)}
              >
                Haru（默认）
              </button>
              {models.map((m) => (
                <button
                  key={m.id}
                  className={`model-btn ${currentModelUrl === m.modelUrl ? "active" : ""}`}
                  onClick={() => onModelChange(m.modelUrl)}
                >
                  {m.name}
                </button>
              ))}
            </div>

            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "上传中…" : "上传新模型（ZIP）"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {uploadMsg && <p className="upload-msg">{uploadMsg}</p>}
            <p className="upload-hint">
              将 Live2D 模型文件打包成 ZIP 上传，需包含 .model3.json 文件
            </p>
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-save" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
