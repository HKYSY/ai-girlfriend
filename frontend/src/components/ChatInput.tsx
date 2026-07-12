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

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
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
        autoSize={{ minRows: 1, maxRows: 4 }}
        // 超过 30 字（约一行容量）后 autoSize 自动增高，最多 4 行
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
