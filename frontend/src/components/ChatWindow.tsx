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

// 过滤 AI 回复中的括号场景/动作/情绪注释（全角括号，1-100字纯中文+标点内容）
// 颜文字用半角括号()不受影响，含数字/英文的括号也保留
export function cleanAssistantText(text: string): string {
  return text
    .replace(/（[^\n（）a-zA-Z0-9]{1,100}）/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
          <div className={`message ${msg.role}`}>
            {msg.role === "assistant" ? cleanAssistantText(msg.content) : msg.content}
          </div>
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
