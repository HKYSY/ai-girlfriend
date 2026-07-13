import { useEffect, useRef } from "react";
import { Avatar, Spin, Button } from "antd";
import { User, ArrowUp } from "lucide-react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  messages: Message[];
  loading: boolean;
  characterName?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

// 过滤 AI 回复中的括号场景/动作/情绪注释
export function cleanAssistantText(text: string): string {
  return text
    .replace(/（[^\n（）a-zA-Z0-9]{1,100}）/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function ChatWindow({ messages, loading, characterName, hasMore, loadingMore, onLoadMore }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="chat-window" ref={containerRef}>
      {hasMore && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <Button
            size="small"
            type="text"
            icon={<ArrowUp size={14} />}
            loading={loadingMore}
            onClick={onLoadMore}
            style={{ color: "#90a4ae", fontSize: 12 }}
          >
            加载更早聊天记录
          </Button>
        </div>
      )}
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
