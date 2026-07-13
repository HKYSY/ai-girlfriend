import { useState, useEffect, useRef } from "react";
import { Button, Typography, Input, message, Spin, Empty } from "antd";
import { Upload as UploadIcon, Trash2, Boxes, FileBox } from "lucide-react";
import { getModels, getPresetModels, uploadModel, deleteModel, updateCharacter } from "../api";
import type { Character, Live2DModelInfo, PresetModel } from "../api";

const { Text } = Typography;

interface Props {
  character: Character;
  onUpdated: (char: Character) => void;
}

export default function SettingsAppearance({ character, onUpdated }: Props) {
  const [models, setModels] = useState<Live2DModelInfo[]>([]);
  const [presets, setPresets] = useState<PresetModel[]>([]);
  const [selectedUrl, setSelectedUrl] = useState(character.modelUrl);
  const [uploading, setUploading] = useState(false);
  const [modelName, setModelName] = useState("");
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadModels = () => {
    return Promise.all([getModels(), getPresetModels()]).then(([m, p]) => {
      setModels(m);
      setPresets(p);
    });
  };

  useEffect(() => {
    loadModels().finally(() => setLoading(false));
  }, []);

  const getCurrentModelName = () => {
    const p = presets.find((m) => m.modelUrl === selectedUrl);
    if (p) return p.name;
    const u = models.find((m) => m.modelUrl === selectedUrl);
    return u?.name || "未知";
  };

  const getCurrentFormat = () => {
    const p = presets.find((m) => m.modelUrl === selectedUrl);
    if (p) return p.format === "cubism4" ? "Cubism 4" : "Cubism 2";
    return models.some((m) => m.modelUrl === selectedUrl) ? "Cubism 4" : "";
  };

  const selectModel = async (url: string) => {
    setSelectedUrl(url);
    try {
      const updated = await updateCharacter(character.id, { modelUrl: url } as any);
      onUpdated(updated);
      message.success("形象已切换");
    } catch {
      message.error("切换失败");
    }
  };

  const handleUpload = async (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      message.error("文件过大，最大支持 100MB");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowed = ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"];
    if (!ext || !allowed.includes(ext)) {
      message.error(`不支持 .${ext} 格式，请上传 ${allowed.join("/")} 文件`);
      return;
    }
    setUploading(true);
    try {
      const result = await uploadModel(file, modelName);
      message.success(`上传成功：${result.name}`);
      await loadModels();
      selectModel(result.modelUrl);
      setModelName("");
    } catch (err) {
      message.error(`上传失败：${err instanceof Error ? err.message : "未知"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (modelId: string, mName: string) => {
    const isCurrent = models.find((m) => m.id === modelId)?.modelUrl === selectedUrl;
    if (isCurrent) {
      message.info("正在删除当前使用的模型，将自动切换到预设模型");
    }
    try {
      await deleteModel(modelId);
      await loadModels();
      if (isCurrent && presets.length > 0) {
        selectModel(presets[0].modelUrl);
      }
      message.success(`已删除：${mName}`);
    } catch {
      message.error("删除失败");
    }
  };

  if (loading) return <div className="settings-loading"><Spin /></div>;

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">角色形象</h2>

      {/* 当前形象预览 */}
      <div className="settings-preview-card">
        <div className="settings-preview-avatar">{getCurrentModelName().charAt(0)}</div>
        <div className="settings-preview-info">
          <Text strong style={{ fontSize: 16 }}>{getCurrentModelName()}</Text>
          <div className="preview-meta-row">
            <span className="preview-format-tag">{getCurrentFormat() || "未知格式"}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>当前使用</Text>
          </div>
        </div>
      </div>

      {/* 统计条 */}
      <div className="appearance-stats">
        <div className="appearance-stat">
          <Boxes size={15} />
          <span>预设 <strong>{presets.length}</strong></span>
        </div>
        <div className="appearance-stat">
          <FileBox size={15} />
          <span>自定义 <strong>{models.length}</strong></span>
        </div>
      </div>

      {/* 预设模型 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">预设模型</h3>
        <div className="settings-model-grid">
          {presets.map((m) => (
            <button
              key={m.id}
              className={`settings-model-card${selectedUrl === m.modelUrl ? " active" : ""}`}
              onClick={() => selectModel(m.modelUrl)}
              type="button"
            >
              <span className="settings-model-avatar">{m.name.charAt(0)}</span>
              <span className="settings-model-name">{m.name}</span>
              <span className="model-badge preset">预设</span>
            </button>
          ))}
        </div>
      </div>

      {/* 已上传模型 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">已上传模型</h3>
        {models.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有上传模型，在下方上传"
            style={{ margin: "16px 0" }}
          />
        ) : (
          <div className="settings-model-grid">
            {models.map((m) => (
              <div
                key={m.id}
                className={`settings-model-wrapper${selectedUrl === m.modelUrl ? " active" : ""}`}
              >
                <button
                  className={`settings-model-card${selectedUrl === m.modelUrl ? " active" : ""}`}
                  onClick={() => selectModel(m.modelUrl)}
                  type="button"
                >
                  <span className="settings-model-avatar">{m.name.charAt(0)}</span>
                  <span className="settings-model-name">{m.name}</span>
                  <span className="model-badge custom">自定义</span>
                </button>
                <button
                  className="settings-model-delete"
                  onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                  title="删除"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 上传 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">上传新模型</h3>
        <div
          className={`settings-upload-zone${dragging ? " drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.xz"
            style={{ display: "none" }}
            onChange={onFileChange}
          />
          <div className="upload-icon-wrap">
            {uploading ? <Spin size="small" /> : <UploadIcon size={20} />}
          </div>
          <Text style={{ fontSize: 13, marginTop: 8, display: "block" }}>
            {uploading ? "上传中…" : "拖拽文件到此处，或"}
          </Text>
          {!uploading && (
            <Button
              icon={<UploadIcon size={14} />}
              onClick={() => fileInputRef.current?.click()}
              size="small"
              style={{ marginTop: 6 }}
            >
              选择文件
            </Button>
          )}
          <Input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="模型显示名（可选）"
            maxLength={20}
            style={{ marginTop: 10 }}
            disabled={uploading}
          />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: "block" }}>
            支持 ZIP/RAR/7Z/TAR/GZ，需含 .model3.json，最大 100MB
          </Text>
        </div>
      </div>
    </div>
  );
}
