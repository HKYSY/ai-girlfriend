import { useState, KeyboardEvent } from "react";
import { Input, Button } from "antd";
import { Send, Smile } from "lucide-react";
import { StickerPanel } from "./StickerPanel";

const { TextArea } = Input;

interface Sticker {
  id: number;
  filename: string;
  category: string;
  keywords: string;
  emotionMatch: string;
  usageCount: number;
  createdAt: string;
}

interface Props {
  onSend: (message: string) => void;
  onSendSticker?: (sticker: Sticker) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, onSendSticker, disabled }: Props) {
  const [text, setText] = useState("");
  const [particles, setParticles] = useState<{ id: number; x: number }[]>([]);
  const [showStickers, setShowStickers] = useState(false);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    // 发送时上抛心形粒子
    const ids = Array.from({ length: 5 }, (_, i) => ({ id: Date.now() + i, x: Math.random() * 50 - 25 }));
    setParticles((p) => [...p, ...ids]);
    setTimeout(() => setParticles((p) => p.filter((x) => !ids.includes(x))), 900);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 回车发送，Shift+回车换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input">
      {showStickers && onSendSticker && (
        <StickerPanel
          onSend={(sticker) => {
            onSendSticker(sticker);
            setShowStickers(false);
          }}
          onClose={() => setShowStickers(false)}
        />
      )}
      {/* 表情包按钮暂时禁用，后续升级优化 */}
      {/* <div className="input-actions">
        <Button
          type="text"
          size="large"
          icon={<Smile size={18} />}
          onClick={() => setShowStickers(!showStickers)}
          disabled={disabled}
          title="表情包"
          className="sticker-btn"
        />
      </div> */}
      <TextArea
        value={text}
        placeholder="跟她说点什么…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoSize={{ minRows: 2, maxRows: 6 }}
        // 默认两行高，最多自动扩展到 6 行
      />
      <div className="send-wrap">
        {particles.map((p) => (
          <span key={p.id} className="send-particle" style={{ ["--px" as any]: `${p.x}px` }}>♥</span>
        ))}
        <Button
          type="primary"
          size="large"
          icon={<Send size={16} />}
          onClick={handleSend}
          disabled={disabled || !text.trim()}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
