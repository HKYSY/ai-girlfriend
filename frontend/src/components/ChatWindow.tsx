import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "antd";
import { User, ArrowUp } from "lucide-react";
import { List } from "react-window";

interface MessageRowProps {
  index: number;
  style: React.CSSProperties;
}

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
    // 全角括号场景描写过滤
    .replace(/（[^\n（）a-zA-Z0-9]{1,100}）/g, "")
    // 未用括号的动作/心理/神态描写（开头连续的描述性句子，到冒号或引号前结束）
    // 匹配：被你一说...、看着...、歪了歪头... 等开头的1-3个描述短句
    .replace(/^(?:[^，。！？：:]{2,15}[，,][^。！？]{2,30}[。.：:]\s*){1,3}/, "")
    // 匹配引导语：然后慢吞吞地打字回你：、接着小声说道：、然后回你：
    .replace(/^[然接跟而][后着着]?[^：:！？]{2,20}[：:]\s*/, "")
    // 未用括号的神态描写（歪了歪头，眼神里带着疑惑，凑近了屏幕。）
    .replace(/^[歪嘟撅皱撇眯眨努][了着过]?[^。！？]{1,15}[，,][^。！？]{2,25}[。.]\s*/, "")
    // 清理多余空格
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function ChatWindow({ messages, loading, characterName, characterAvatarUrl, userAvatarUrl, hasMore, loadingMore, onLoadMore }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const [listHeight, setListHeight] = useState(600);

  // 动态计算列表高度
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const containerHeight = containerRef.current.clientHeight;
        // 减去加载更多按钮和加载状态的高度
        setListHeight(Math.max(containerHeight - 100, 400));
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // 自动滚动到最新消息
  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);

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

  // 虚拟列表的行渲染函数
  const MessageRow = ({ index, style }: MessageRowProps) => {
    const msg = messages[index];
    // 解析 [表情包:category:filename] 格式的旧数据 / DB 加载数据
    const stickerMatch = msg.content?.match(/^\[表情包:([^:]+):([^\]]+)\]$/);
    const inlineSticker = stickerMatch
      ? {
          id: -1,
          url: `/stickers/${stickerMatch[2]}`,
          category: stickerMatch[1],
        }
      : msg.sticker;
    // sticker-only 消息：有 sticker（用户发的纯表情包 + AI 发的纯表情包都不进气泡，独立成行）
    const isStickerOnly = !!inlineSticker;
    
    return (
      <div style={style} className={`message-row ${msg.role}${isStickerOnly ? " sticker-only" : ""}`}>
        {msg.role === "assistant" && renderAiAvatar()}
        {msg.role === "user" && renderUserAvatar()}
        {isStickerOnly ? (
          <div className="message-sticker-only">
            <img
              src={inlineSticker!.url}
              alt={inlineSticker!.category}
              className="sticker-img-only"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : (
          <div className={`message ${msg.role}`}>
            {msg.role === "assistant" ? cleanAssistantText(msg.content) : msg.content}
          </div>
        )}
      </div>
    );
  };

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
      {/* 虚拟列表渲染消息 */}
      {messages.length > 0 ? (
        <List
          ref={listRef}
          height={listHeight}
          itemCount={messages.length}
          itemSize={80}
          width="100%"
        >
          {MessageRow}
        </List>
      ) : (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: '#999',
          fontSize: '14px'
        }}>
          开始和她聊天吧~ 👋
        </div>
      )}
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
