import { useEffect, useRef } from "react";
import { Avatar, Spin } from "antd";
import { User } from "lucide-react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  messages: Message[];
  loading: boolean;
  characterName?: string;
}

export default function ChatWindow({ messages, loading, characterName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="chat-window">
      {messages.map((msg, i) => (
        <div key={i} className={`message-row ${msg.role}`}>
          {msg.role === "assistant" && (
            <Avatar size={36} style={{ background: "#e91e63", flexShrink: 0 }}>
              {characterName?.charAt(0) || "念"}
            </Avatar>
          )}
          {msg.role === "user" && (
            <Avatar size={36} icon={<User size={18} />} style={{ background: "#5c6bc0", flexShrink: 0 }} />
          )}
          <div className={`message ${msg.role}`}>{msg.content}</div>
        </div>
      ))}
      {loading && (
        <div className="message-row assistant">
          <Avatar size={36} style={{ background: "#e91e63", flexShrink: 0 }}>
            {characterName?.charAt(0) || "念"}
          </Avatar>
          <div className="message assistant typing">
            <Spin size="small" /> 她正在输入…
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
