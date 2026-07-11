import { useState, KeyboardEvent } from "react";
import { Input, Button } from "antd";
import { Send } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input">
      <Input
        value={text}
        placeholder="跟她说点什么…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        size="large"
      />
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
  );
}
