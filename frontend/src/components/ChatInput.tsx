import { useState, KeyboardEvent } from "react";
import { Input, Button } from "antd";
import { Send } from "lucide-react";

const { TextArea } = Input;

interface Props {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [particles, setParticles] = useState<{ id: number; x: number }[]>([]);

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
