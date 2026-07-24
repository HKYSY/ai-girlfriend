// 聊天逻辑 Hook：提取自 App.tsx
// 包含消息发送、表情包发送、主动消息、SSE超时处理等核心逻辑

import { useState, useRef, useCallback } from "react";
import type { Character, PetState, Sticker } from "../api";
import { streamChat, streamProactive, streamSticker } from "../api";

// 从 ChatWindow 导入 Message 类型
export interface Message {
  role: "user" | "assistant";
  content: string;
  sticker?: {
    id: number;
    url: string;
    category: string;
  };
}

// Hook 配置参数
interface UseChatOptions {
  currentCharacter: Character | null;
  onMoodChange: (mood: number) => void;
  onCharactersMoodChange: (characterId: string, mood: number) => void;
  onPetStateChange: (petState: PetState) => void;
}

// Hook 返回值
export interface UseChatReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleSend: (text: string) => Promise<void>;
  handleSendSticker: (sticker: Sticker) => Promise<void>;
  triggerProactive: () => Promise<void>;
  // 暴露 refs 供外部定时器使用
  lastActivityRef: React.MutableRefObject<number>;
  proactiveActiveRef: React.MutableRefObject<boolean>;
  assistantStartedRef: React.MutableRefObject<boolean>;
}

// 默认回复（SSE超时时使用）
const DEFAULT_REPLIES = [
  "抱歉刚才打盹了，能再说一遍吗？",
  "嗯？你刚说什么，我没听清～",
  "刚才走神了…你说的啥？",
  "啊不好意思，刚刚一下没反应过来，再说一次？",
];

// SSE 超时时间（毫秒）
const SSE_TIMEOUT = 30000;

export function useChat(options: UseChatOptions): UseChatReturn {
  const {
    currentCharacter,
    onMoodChange,
    onCharactersMoodChange,
    onPetStateChange,
  } = options;

  // ========== 聊天状态 ==========
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // ========== 流式消息追踪 ==========
  const assistantStartedRef = useRef(false);

  // ========== 用户最后活动时间 ==========
  const lastActivityRef = useRef<number>(Date.now());

  // ========== 是否处于"主动消息已发，等待用户回复"状态 ==========
  const proactiveActiveRef = useRef<boolean>(false);

  // ========== AI 主动发消息 ==========
  const triggerProactive = useCallback(async () => {
    if (!currentCharacter) return;
    assistantStartedRef.current = false;
    setLoading(true);
    try {
      await streamProactive(currentCharacter.id, {
        onMood: (m) => {
          onMoodChange(m);
          onCharactersMoodChange(currentCharacter.id, m);
        },
        onEmotion: () => {
          // 情绪回调目前未在原代码中使用
        },
        onText: (chunk) => {
          if (!assistantStartedRef.current) {
            assistantStartedRef.current = true;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: chunk },
            ]);
          } else {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: last.content + chunk },
                ];
              }
              return prev;
            });
          }
        },
        onDone: () => setLoading(false),
        onError: (err) => {
          setLoading(false);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `（${err}）` },
          ]);
        },
      });
    } catch {
      setLoading(false);
    }
  }, [currentCharacter, onMoodChange, onCharactersMoodChange]);

  // ========== 发送消息 ==========
  const handleSend = useCallback(async (text: string) => {
    if (!currentCharacter) return;
    // 用户发消息 → 重置定时器状态
    lastActivityRef.current = Date.now();
    proactiveActiveRef.current = false;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    assistantStartedRef.current = false;

    // ========== 需求7A：前端SSE超时检测 ==========
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      // 超时兜底：如果30秒内AI没有回复，显示默认回复
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          if (!assistantStartedRef.current) {
            const fallback = DEFAULT_REPLIES[Math.floor(Math.random() * DEFAULT_REPLIES.length)];
            assistantStartedRef.current = true;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: fallback },
            ]);
            setLoading(false);
            console.log(`[chat] 前端超时，显示默认回复: "${fallback}"`);
          }
          resolve();
        }, SSE_TIMEOUT);
      });

      await Promise.race([
        streamChat(text, currentCharacter.id, {
          onMood: (m) => {
            onMoodChange(m);
            onCharactersMoodChange(currentCharacter.id, m);
          },
          onEmotion: () => {
            // 情绪回调目前未在原代码中使用
          },
          onText: (chunk) => {
            // 收到AI回复，清除超时
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (!assistantStartedRef.current) {
              assistantStartedRef.current = true;
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: chunk },
              ]);
              setLoading(false);
            } else {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant") {
                  return [
                    ...prev.slice(0, -1),
                    { role: "assistant", content: last.content + chunk },
                  ];
                }
                return prev;
              });
            }
          },
          onPetState: (state, coinReward) => {
            onPetStateChange(state);
            if (coinReward && coinReward > 0) {
              console.log(`[pet] 聊天奖励 ${coinReward} 金币`);
            }
          },
          onSticker: () => {
            // AI发送表情包：添加到最后一条AI消息（暂时禁用）
          },
          onDone: () => {
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            setLoading(false);
          },
          onError: (err) => {
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            setLoading(false);
            // 如果前端已经显示了默认回复，不再显示错误
            if (assistantStartedRef.current) return;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `（${err}）` },
            ]);
          },
        }),
        timeoutPromise,
      ]);
    } catch {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
      if (!assistantStartedRef.current) {
        const fallback = DEFAULT_REPLIES[Math.floor(Math.random() * DEFAULT_REPLIES.length)];
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fallback },
        ]);
      }
    }
  }, [currentCharacter, onMoodChange, onCharactersMoodChange, onPetStateChange]);

  // ========== 发送表情包（流式 + 触发 AI 回复）==========
  const handleSendSticker = useCallback(async (sticker: Sticker) => {
    if (!currentCharacter) return;

    // 重置定时器
    lastActivityRef.current = Date.now();
    proactiveActiveRef.current = false;

    // 立即添加用户表情包消息
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: "",
        sticker: {
          id: sticker.id,
          url: `/stickers/${sticker.filename}`,
          category: sticker.category,
        },
      },
    ]);
    setLoading(true);
    assistantStartedRef.current = false;

    try {
      await streamSticker(currentCharacter.id, sticker.id, {
        onMood: (m) => {
          onMoodChange(m);
          onCharactersMoodChange(currentCharacter.id, m);
        },
        onEmotion: () => {
          // 情绪回调目前未在原代码中使用
        },
        onText: (chunk) => {
          if (!assistantStartedRef.current) {
            assistantStartedRef.current = true;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: chunk },
            ]);
            setLoading(false);
          } else {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: last.content + chunk },
                ];
              }
              return prev;
            });
          }
        },
        onPetState: (state) => onPetStateChange(state),
        onSticker: (s) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, sticker: s }];
            }
            return prev;
          });
        },
        onDone: () => setLoading(false),
        onError: (err) => {
          setLoading(false);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `（${err}）` },
          ]);
        },
      });
    } catch (error) {
      setLoading(false);
      console.error("发送表情包失败:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "（网络开小差了，再发一次试试～）" },
      ]);
    }
  }, [currentCharacter, onMoodChange, onCharactersMoodChange, onPetStateChange]);

  return {
    messages,
    setMessages,
    loading,
    setLoading,
    handleSend,
    handleSendSticker,
    triggerProactive,
    lastActivityRef,
    proactiveActiveRef,
    assistantStartedRef,
  };
}

// 导出 triggerProactive 的类型（供外部定时器调用）
export type { UseChatOptions };