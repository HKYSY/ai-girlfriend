import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "antd";
import { User, ArrowUp } from "lucide-react";

export interface Message {
  role: "user" | "assistant";
  content: string;
  sticker?: {
    id: number;
    url: string;
    category: string;
  };
}

interface Props {
  messages: Message[];
  loading: boolean;
  characterName?: string;
  characterAvatarUrl?: string;
  userAvatarUrl?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

// 过滤 AI 回复中的括号场景/动作/情绪注释
export function cleanAssistantText(text: string): string {
  return text
    // 只保留原有的全角括号过滤逻辑
    .replace(/（[^\n（）a-zA-Z0-9]{1,100}）/g, "")
    // 清理多余空格
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function ChatWindow({ messages, loading, characterName, characterAvatarUrl, userAvatarUrl, hasMore, loadingMore, onLoadMore }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const renderAiAvatar = () =>
    characterAvatarUrl ? (
      <img src={characterAvatarUrl} className="chat-avatar-img" alt="" />
    ) : (
      <Avatar size={36} style={{ background: "#e91e63", flexShrink: 0 }}>
        {characterName?.charAt(0) || "念"}
      </Avatar>
    );

  const renderUserAvatar = () =>
    userAvatarUrl ? (
      <img src={userAvatarUrl} className="chat-avatar-img" alt="" />
    ) : (
      <Avatar size={36} icon={<User size={18} />} style={{ background: "#5c6bc0", flexShrink: 0 }} />
    );

  // 新消息时触发底部光带
  const prevLen = useRef(messages.length);
  const [glowKey, setGlowKey] = useState(0);
  useEffect(() => {
    if (messages.length > prevLen.current) setGlowKey((k) => k + 1);
    prevLen.current = messages.length;
  }, [messages.length]);

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
          {msg.role === "assistant" && renderAiAvatar()}
          {msg.role === "user" && renderUserAvatar()}
          <div className={`message ${msg.role}`}>
            {msg.role === "assistant" ? cleanAssistantText(msg.content) : msg.content}
            {msg.sticker && (
              <div className="message-sticker">
                <img
                  src={msg.sticker.url}
                  alt={msg.sticker.category}
                  className="sticker-img"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
      {loading && (
        <div className="message-row assistant">
          {renderAiAvatar()}
          <div className="message assistant typing">
            <span className="typing-dots"><i></i><i></i><i></i></span>
            <span>她正在输入…</span>
          </div>
        </div>
      )}
      {glowKey > 0 && <div className="new-msg-glow" key={glowKey} />}
      <div ref={bottomRef} />
    </div>
  );
}
