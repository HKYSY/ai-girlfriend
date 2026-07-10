import { useEffect, useRef } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  messages: Message[];
  loading: boolean;
}

export default function ChatWindow({ messages, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 有新消息时自动滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="chat-window">
      {messages.map((msg, i) => (
        <div key={i} className={`message ${msg.role}`}>
          {msg.content}
        </div>
      ))}
      {loading && <div className="message assistant typing">她正在输入…</div>}
      <div ref={bottomRef} />
    </div>
  );
}
