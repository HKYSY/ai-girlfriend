import { useState, useRef } from "react";
import { Button, Slider, Typography, message } from "antd";
import { User, Upload, Trash2, RotateCcw } from "lucide-react";
import { uploadAvatar } from "../api";

const { Text } = Typography;

const AI_BUBBLE_PRESETS = ["#f0e6f6", "#ffe0e9", "#e0f2f1", "#fff3e0", "#e3f2fd", "#f5f5f5"];
const USER_BUBBLE_PRESETS = ["#e91e63", "#5c6bc0", "#66bb6a", "#ff7043", "#ab47bc", "#26a69a"];

function loadVal(key: string): string {
  return localStorage.getItem(key) || "";
}

export default function SettingsChat() {
  const [userAvatar, setUserAvatar] = useState(loadVal("chat_user_avatar"));
  const [aiBubble, setAiBubble] = useState(loadVal("chat_ai_bubble"));
  const [userBubble, setUserBubble] = useState(loadVal("chat_user_bubble"));
  const [fontSize, setFontSize] = useState(parseInt(loadVal("chat_font_size") || "0", 10) || 0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dispatch = () => window.dispatchEvent(new Event("chat-appearance-change"));

  const saveVal = (key: string, val: string, setter: (v: string) => void) => {
    setter(val);
    if (val) localStorage.setItem(key, val); else localStorage.removeItem(key);
    dispatch();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      message.error("图片过大，最大 2MB");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      setUserAvatar(result.url);
      localStorage.setItem("chat_user_avatar", result.url);
      dispatch();
      message.success("头像已更新");
    } catch {
      message.error("上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAvatar = () => {
    setUserAvatar("");
    localStorage.removeItem("chat_user_avatar");
    dispatch();
    message.success("已移除头像");
  };

  const saveFontSize = (v: number) => {
    setFontSize(v);
    if (v) localStorage.setItem("chat_font_size", String(v)); else localStorage.removeItem("chat_font_size");
    dispatch();
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">聊天外观</h2>

      {/* 用户头像 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">我的头像</h3>
        <div className="chat-avatar-row">
          {userAvatar ? (
            <img src={userAvatar} className="chat-avatar-preview" alt="" />
          ) : (
            <div className="chat-avatar-preview placeholder"><User size={24} /></div>
          )}
          <div className="chat-avatar-actions">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={handleUpload} />
            <Button icon={<Upload size={14} />} onClick={() => fileRef.current?.click()} loading={uploading}>
              {userAvatar ? "更换头像" : "上传头像"}
            </Button>
            {userAvatar && (
              <Button icon={<Trash2 size={14} />} onClick={removeAvatar} danger>移除</Button>
            )}
          </div>
        </div>
        <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: "block" }}>
          在聊天中显示为你的头像，所有角色通用
        </Text>
      </div>

      {/* AI 气泡颜色 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">TA 的气泡颜色</h3>
        <div className="chat-preset-list">
          {AI_BUBBLE_PRESETS.map((c) => (
            <button
              key={c}
              className={`chat-preset-swatch${aiBubble === c ? " active" : ""}`}
              style={{ background: c }}
              onClick={() => saveVal("chat_ai_bubble", aiBubble === c ? "" : c, setAiBubble)}
              type="button"
            />
          ))}
          <label className="chat-preset-swatch custom" title="自定义颜色">
            <input type="color" value={aiBubble || "#ffffff"} onChange={(e) => saveVal("chat_ai_bubble", e.target.value, setAiBubble)} />
          </label>
          {aiBubble && (
            <button className="chat-reset-btn" onClick={() => saveVal("chat_ai_bubble", "", setAiBubble)} type="button">
              <RotateCcw size={13} /> 默认
            </button>
          )}
        </div>
      </div>

      {/* 用户气泡颜色 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">我的气泡颜色</h3>
        <div className="chat-preset-list">
          {USER_BUBBLE_PRESETS.map((c) => (
            <button
              key={c}
              className={`chat-preset-swatch${userBubble === c ? " active" : ""}`}
              style={{ background: c }}
              onClick={() => saveVal("chat_user_bubble", userBubble === c ? "" : c, setUserBubble)}
              type="button"
            />
          ))}
          <label className="chat-preset-swatch custom" title="自定义颜色">
            <input type="color" value={userBubble || "#e91e63"} onChange={(e) => saveVal("chat_user_bubble", e.target.value, setUserBubble)} />
          </label>
          {userBubble && (
            <button className="chat-reset-btn" onClick={() => saveVal("chat_user_bubble", "", setUserBubble)} type="button">
              <RotateCcw size={13} /> 默认
            </button>
          )}
        </div>
      </div>

      {/* 字体大小 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">
          字体大小 <span className="chat-font-value">{fontSize ? `${fontSize}px` : "默认"}</span>
        </h3>
        <Slider
          min={12}
          max={20}
          step={1}
          value={fontSize || 15}
          onChange={saveFontSize}
          marks={{ 12: "12", 14: "14", 16: "16", 18: "18", 20: "20" }}
        />
        <Button size="small" type="text" icon={<RotateCcw size={13} />} onClick={() => saveFontSize(0)} style={{ marginTop: 4 }}>
          恢复默认
        </Button>
      </div>

      {/* 实时预览 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">预览</h3>
        <div className="chat-preview-box">
          <div className="chat-preview-row ai">
            <div className="chat-preview-avatar ai">玉</div>
            <div
              className="chat-preview-bubble ai"
              style={{ background: aiBubble || undefined, fontSize: fontSize || undefined }}
            >
              今天想我了吗～
            </div>
          </div>
          <div className="chat-preview-row user">
            <div
              className="chat-preview-bubble user"
              style={{ background: userBubble || undefined, fontSize: fontSize || undefined }}
            >
              想了呀
            </div>
            <div className="chat-preview-avatar user">
              {userAvatar ? <img src={userAvatar} alt="" /> : <User size={16} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
