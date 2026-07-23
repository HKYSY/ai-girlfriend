import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import "./settings.css";
import "./onboarding.css";
import "./mood-indicator.css";
import ChatWindow, { type Message } from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import Live2DCanvas from "./components/Live2DCanvas";
import MeteorCanvas from "./components/MeteorCanvas";
import SettingsPage from "./components/SettingsPage";
import OnboardingWizard from "./components/OnboardingWizard";
import MoodIndicator from "./components/MoodIndicator";
import {
  streamChat,
  streamProactive,
  streamPetAIReply,
  moodDecay,
  petDecay,
  getCharacters,
  getCharacterDetail,
  createCharacter,
  deleteCharacter,
  clearConversation,
  backfillDiaries,
  getMessages,
  extractFacts,
  streamSticker,
} from "./api";
import type { Character, PetState, Sticker } from "./api";
import { moodToEmoji } from "./utils";
import {
  getStoredTheme,
  applyTheme,
  persistTheme,
  type ThemeMode,
} from "./theme";

// 默认分栏比例（Live2D 占比）
const DEFAULT_SPLIT_RATIO = 0.55;
// 主动消息触发时长（毫秒）：5 分钟无消息
const PROACTIVE_DELAY = 5 * 60 * 1000;
// 心情衰减间隔（毫秒）：每 3 分钟
const MOOD_DECAY_INTERVAL = 3 * 60 * 1000;
// 主动消息定时器检查间隔
const TIMER_CHECK_INTERVAL = 30 * 1000;

function loadSplitRatio(): number {
  const saved = localStorage.getItem("splitRatio");
  const n = saved ? parseFloat(saved) : NaN;
  if (!isNaN(n) && n >= 0.2 && n <= 0.8) return n;
  return DEFAULT_SPLIT_RATIO;
}

// ========== 聊天外观（全局偏好，存 localStorage） ==========
interface ChatAppearance {
  userAvatarUrl: string;
  aiBubbleColor: string;
  userBubbleColor: string;
  fontSize: number;
}
function loadChatAppearance(): ChatAppearance {
  return {
    userAvatarUrl: localStorage.getItem("chat_user_avatar") || "",
    aiBubbleColor: localStorage.getItem("chat_ai_bubble") || "",
    userBubbleColor: localStorage.getItem("chat_user_bubble") || "",
    fontSize: parseInt(localStorage.getItem("chat_font_size") || "0", 10) || 0,
  };
}
function applyChatAppearance(a: ChatAppearance) {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark";
  // 深色模式下自定义气泡颜色降亮（混入深色背景），避免纯色过亮刺眼
  const dim = (c: string) => (isDark ? `color-mix(in srgb, ${c} 60%, #0a0a14)` : c);
  if (a.aiBubbleColor) root.style.setProperty("--chat-bubble-ai", dim(a.aiBubbleColor));
  else root.style.removeProperty("--chat-bubble-ai");
  if (a.userBubbleColor) root.style.setProperty("--chat-bubble-user", dim(a.userBubbleColor));
  else root.style.removeProperty("--chat-bubble-user");
  if (a.fontSize) root.style.setProperty("--chat-font-size", a.fontSize + "px");
  else root.style.removeProperty("--chat-font-size");
}

// 心情值 → emoji（已提取到 utils.ts）

export default function App() {
  // ========== 角色列表与当前角色 ==========
  const [characters, setCharacters] = useState<Character[]>([]);
  const [currentCharacter, setCurrentCharacter] = useState<Character | null>(null);
  const [charSelectorOpen, setCharSelectorOpen] = useState(false);
  const [loadingChars, setLoadingChars] = useState(true);

  // ========== 聊天状态 ==========
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstMessageId, setFirstMessageId] = useState<number>(0);
  const [mood, setMood] = useState(60);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [bubbleText, setBubbleText] = useState<{ id: number; text: string } | null>(null);

  // ========== UI 状态 ==========
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 首次打开引导页（localStorage 标记是否已完成）
  const [onboardingActive, setOnboardingActive] = useState(() => {
    return localStorage.getItem("onboarding-completed") !== "true";
  });
  const [closeSignal, setCloseSignal] = useState(0);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  // 主动消息开关（关机按钮）：false 时 AI 不会自动发消息
  const [proactiveEnabled, setProactiveEnabled] = useState(() => {
    return localStorage.getItem("proactiveEnabled") !== "false";
  });
  // ref 始终指向最新值（供 setInterval 闭包读取）
  const proactiveEnabledRef = useRef(proactiveEnabled);
  proactiveEnabledRef.current = proactiveEnabled;

  // ========== 主题状态 ==========
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  // 应用主题 + 监听系统主题变化（跟随系统时实时响应）
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // ========== 聊天外观 ==========
  const [chatAppearance, setChatAppearance] = useState(loadChatAppearance);
  useEffect(() => { applyChatAppearance(chatAppearance); }, [chatAppearance, theme]);
  useEffect(() => {
    const handler = () => setChatAppearance(loadChatAppearance());
    window.addEventListener("chat-appearance-change", handler);
    return () => window.removeEventListener("chat-appearance-change", handler);
  }, []);

  // 心情联动极光色调：心情高偏粉暖(310)，心情低偏蓝冷(240)
  // 同时调整界面温暖度和饱和度
  useEffect(() => {
    const hue = 240 + (mood / 100) * 70;
    document.documentElement.style.setProperty("--aurora-hue", String(hue));

    // 心情温暖度：心情高(>70)为暖，心情低(<30)为冷
    const warmth = mood > 70 ? 1 : mood < 30 ? 0 : 0.5;
    document.documentElement.style.setProperty("--mood-warmth", String(warmth));

    // 心情饱和度：心情高色彩更鲜艳，心情低更黯淡
    const saturation = 0.02 + (mood / 100) * 0.03;
    document.documentElement.style.setProperty("--mood-saturation", String(saturation));
  }, [mood]);

  // 时间感知背景色调：早上暖(350)、中午中性(320)、傍晚暖(30)、夜晚冷(280)
  // 心情会微调色调：心情高时偏暖，心情低时偏冷
  useEffect(() => {
    const updateTimeHue = () => {
      const hour = new Date().getHours();
      let baseHue: number;
      if (hour >= 5 && hour < 9) {
        // 早晨：暖粉调（像初升的太阳）
        baseHue = 350;
      } else if (hour >= 9 && hour < 17) {
        // 白天：中性暖调
        baseHue = 320;
      } else if (hour >= 17 && hour < 20) {
        // 傍晚：暖橙调（像夕阳）
        baseHue = 30;
      } else {
        // 夜晚：冷紫调（像星夜）
        baseHue = 280;
      }
      // 心情微调色调：心情高时偏暖（-20），心情低时偏冷（+20）
      const moodOffset = mood > 70 ? -20 : mood < 30 ? 20 : 0;
      const finalHue = baseHue + moodOffset;
      document.documentElement.style.setProperty("--time-hue", String(finalHue));
    };
    updateTimeHue();
    // 每分钟检查一次时间变化
    const interval = setInterval(updateTimeHue, 60 * 1000);
    return () => clearInterval(interval);
  }, [mood]);

  // ========== 桌宠状态 ==========
  const [petState, setPetState] = useState<PetState | null>(null);

  // 流式消息追踪
  const assistantStartedRef = useRef(false);

  // 用户最后活动时间（发消息/切换角色）
  const lastActivityRef = useRef<number>(Date.now());
  // 是否处于"主动消息已发，等待用户回复"状态
  const proactiveActiveRef = useRef<boolean>(false);

  // ========== 初始化：加载角色列表 ==========
  useEffect(() => {
    (async () => {
      try {
        let list = await getCharacters();
        if (list.length === 0) {
          // 自动创建默认角色
          const def = await createCharacter({
            name: "玉子",
            personalityTemplate: "yuko",
            customPersonality: "",
            modelUrl: "/live2d/icegirl/IceGirl.model3.json",
          });
          list = [def];
        }
        setCharacters(list);
        // 默认选第一个
        await selectCharacter(list[0].id, list);
      } catch (e) {
        console.error("[App] 初始化失败:", e);
      } finally {
        setLoadingChars(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== 切换角色 ==========
  const selectCharacter = async (id: string, list?: Character[]) => {
    try {
      const detail = await getCharacterDetail(id);
      const char = list?.find((c) => c.id === id) || detail.character;
      setCurrentCharacter(char);
      setMood(char.mood);
      setEmotion(null);
      // 从数据库加载最近消息（分页）
      const msgData = await getMessages(id, 0, 50);
      const histMessages: Message[] = msgData.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      if (histMessages.length === 0) {
        setMessages([
          { role: "assistant", content: `亲爱的你来啦～我是${char.name}，今天过得怎么样呀？` },
        ]);
      } else {
        setMessages(histMessages);
      }
      // 分页状态
      setHasMore(msgData.total > histMessages.length);
      const first = msgData.messages[0];
      setFirstMessageId(first ? first.id : 0);
      // 重置活动时间和主动消息状态
      lastActivityRef.current = Date.now();
      proactiveActiveRef.current = false;
      setCharSelectorOpen(false);
      // 异步提取事实
      extractFacts(id).catch(() => {});
    } catch (e) {
      console.error("[App] 切换角色失败:", e);
    }
  };

  // ========== 每天首次打开时自动生成昨天日记 ==========
  useEffect(() => {
    if (!currentCharacter) return;
    // 补生成最近 7 天缺失的日记（已有日记或无对话的日期会自动跳过）
    backfillDiaries(currentCharacter.id, 7)
      .then((result) => {
        if (result.generated.length > 0) {
          console.log(`[diary] 已为 ${currentCharacter.name} 补生成 ${result.generated.length} 篇日记: ${result.generated.join(", ")}`);
        }
      })
      .catch((e) => console.error("[diary] 补生成失败:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharacter?.id]);

  // ========== 需求2A：每日首次问候（75%概率） ==========
  useEffect(() => {
    if (!currentCharacter) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/daily-greeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: currentCharacter.id }),
        });
        const contentType = res.headers.get("content-type") || "";
        // JSON响应 = 未触发（already_greeted 或 dice_miss），不做任何事
        if (contentType.includes("application/json")) {
          return;
        }
        // SSE响应 = 已触发，消费这个流的响应
        assistantStartedRef.current = false;
        setLoading(true);
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "text") {
                if (!assistantStartedRef.current) {
                  assistantStartedRef.current = true;
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.text },
                  ]);
                } else {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === "assistant") {
                      return [
                        ...prev.slice(0, -1),
                        { role: "assistant", content: last.content + data.text },
                      ];
                    }
                    return prev;
                  });
                }
              } else if (data.type === "mood") {
                setMood(data.mood);
                setCharacters((prev) =>
                  prev.map((c) =>
                    c.id === currentCharacter.id ? { ...c, mood: data.mood } : c
                  )
                );
                setCurrentCharacter((prev) =>
                  prev ? { ...prev, mood: data.mood } : prev
                );
              } else if (data.type === "emotion") {
                setEmotion(data.emotion);
              } else if (data.type === "done") {
                setLoading(false);
              } else if (data.type === "error") {
                setLoading(false);
              }
            } catch { /* 忽略解析错误 */ }
          }
        }
        setLoading(false);
      } catch {
        // 静默忽略
      }
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharacter?.id]);

  // ========== 主动消息定时器 ==========
  useEffect(() => {
    if (!currentCharacter) return;

    const proactiveTimer = window.setInterval(() => {
      // 关机状态下不触发主动消息
      if (!proactiveEnabledRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= PROACTIVE_DELAY && !proactiveActiveRef.current && !loading) {
        proactiveActiveRef.current = true;
        triggerProactive();
      }
    }, TIMER_CHECK_INTERVAL);

    // 心情衰减定时器（同时触发桌宠状态衰减：饱腹感下降、疲劳度恢复、亲密度微降）
    const decayTimer = window.setInterval(() => {
      if (!currentCharacter) return;
      // 桌宠状态衰减（饱腹感下降、疲劳度恢复）—— 始终执行，不受主动消息状态影响
      petDecay(currentCharacter.id)
        .then((data) => {
          if (data.decayed) {
            setPetState(data.petState);
            console.log(`[pet-decay] ${data.minutesPassed}min 已衰减`);
          }
        })
        .catch((e) => console.error("[pet-decay] 失败:", e));
      // 心情衰减 —— 仅在用户长时间不回复（主动消息等待中）时触发
      if (proactiveActiveRef.current && !loading) {
        moodDecay(currentCharacter.id)
          .then((data) => {
            setMood(data.mood);
            // 同步更新角色列表中的心情
            setCharacters((prev) =>
              prev.map((c) =>
                c.id === currentCharacter.id ? { ...c, mood: data.mood } : c
              )
            );
            setCurrentCharacter((prev) =>
              prev ? { ...prev, mood: data.mood } : prev
            );
            console.log(`[mood-decay] ${data.mood} (${data.level})`);
          })
          .catch((e) => console.error("[mood-decay] 失败:", e));
      }
    }, MOOD_DECAY_INTERVAL);

    return () => {
      clearInterval(proactiveTimer);
      clearInterval(decayTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharacter, loading]);

  // ========== AI 主动发消息 ==========
  const triggerProactive = async () => {
    if (!currentCharacter) return;
    assistantStartedRef.current = false;
    setLoading(true);
    try {
      await streamProactive(currentCharacter.id, {
        onMood: (m) => {
          setMood(m);
          setCharacters((prev) =>
            prev.map((c) =>
              c.id === currentCharacter.id ? { ...c, mood: m } : c
            )
          );
          setCurrentCharacter((prev) => (prev ? { ...prev, mood: m } : prev));
        },
        onEmotion: (emo) => setEmotion(emo),
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
  };

  // ========== 发送消息 ==========
  const handleSend = async (text: string) => {
    if (!currentCharacter) return;
    // 用户发消息 → 重置定时器状态
    lastActivityRef.current = Date.now();
    proactiveActiveRef.current = false;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    assistantStartedRef.current = false;

    // ========== 需求7A：前端SSE超时检测 ==========
    const SSE_TIMEOUT = 30000; // 30秒超时
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const defaultReplies = [
      "抱歉刚才打盹了，能再说一遍吗？",
      "嗯？你刚说什么，我没听清～",
      "刚才走神了…你说的啥？",
      "啊不好意思，刚刚一下没反应过来，再说一次？",
    ];

    try {
      // 超时兜底：如果30秒内AI没有回复，显示默认回复
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          if (!assistantStartedRef.current) {
            const fallback = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
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
            setMood(m);
            setCharacters((prev) =>
              prev.map((c) =>
                c.id === currentCharacter.id ? { ...c, mood: m } : c
              )
            );
            setCurrentCharacter((prev) => (prev ? { ...prev, mood: m } : prev));
          },
          onEmotion: (emo) => setEmotion(emo),
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
            setPetState(state);
            if (coinReward && coinReward > 0) {
              console.log(`[pet] 聊天奖励 ${coinReward} 金币`);
            }
          },
          onSticker: (_sticker) => {
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
        const fallback = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fallback },
        ]);
      }
    }
  };

  // ========== 发送表情包（流式 + 触发 AI 回复）==========
  const handleSendSticker = async (sticker: Sticker) => {
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
          setMood(m);
          setCharacters((prev) =>
            prev.map((c) => (c.id === currentCharacter.id ? { ...c, mood: m } : c))
          );
          setCurrentCharacter((prev) => (prev ? { ...prev, mood: m } : prev));
        },
        onEmotion: (emo) => setEmotion(emo),
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
        onPetState: (state) => setPetState(state),
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
  };

  // ========== Live2D 位置（每次打开/刷新回到默认位置，不持久化）==========
  const handlePositionChange = useCallback(
    (_pos: { x: number; y: number; scale: number }) => {
      // 仅会话内保持（Live2DCanvas 内部 model ref 直接操作），不保存到后端
    },
    []
  );

  // ========== 角色更新回调（SettingsPanel 保存后）==========
  const handleCharacterUpdated = (updated: Character) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    setCurrentCharacter(updated);
    setMood(updated.mood);
  };

  // ========== 清空记忆回调 ==========
  const handleMemoryCleared = () => {
    setMessages([
      { role: "assistant", content: "嗯…感觉脑袋清爽多了，我们重新开始吧～" },
    ]);
    setMood(60);
    setEmotion(null);
    lastActivityRef.current = Date.now();
    proactiveActiveRef.current = false;
  };

  // ========== 清空当前聊天记录 ==========
  const handleClearChat = async () => {
    if (!currentCharacter) return;
    if (!confirm("确定要清空当前聊天记录吗？此操作不可恢复。")) return;
    try {
      await clearConversation(currentCharacter.id);
      handleMemoryCleared();
    } catch (e) {
      console.error("[App] 清空聊天记录失败:", e);
      alert("清空聊天记录失败");
    }
  };

  // ========== 创建新角色 ==========
  const handleCreateCharacter = async () => {
    try {
      const newChar = await createCharacter({
        name: "新角色",
        personalityTemplate: "yuko",
        customPersonality: "",
        modelUrl: "/live2d/icegirl/IceGirl.model3.json",
      });
      setCharacters((prev) => [...prev, newChar]);
      await selectCharacter(newChar.id, [...characters, newChar]);
      // 自动打开设置面板让用户编辑
      setSettingsOpen(true);
    } catch (e) {
      console.error("[App] 创建角色失败:", e);
      alert("创建角色失败");
    }
  };

  // ========== 删除角色 ==========
  const handleDeleteCharacter = async (id: string) => {
    if (characters.length <= 1) {
      alert("至少需要保留一个角色");
      return;
    }
    if (!confirm("确定要删除这个角色吗？她的所有记忆都会消失。")) return;
    try {
      await deleteCharacter(id);
      const remaining = characters.filter((c) => c.id !== id);
      setCharacters(remaining);
      if (currentCharacter?.id === id) {
        await selectCharacter(remaining[0].id, remaining);
      }
    } catch (e) {
      console.error("[App] 删除角色失败:", e);
    }
  };

  // ========== 切换主动消息开关 ==========
  const toggleProactive = () => {
    setProactiveEnabled((v) => !v);
    // 关机时重置主动消息状态
    if (proactiveEnabled) {
      proactiveActiveRef.current = false;
    }
  };

  // ========== 桌宠操作触发的 AI 联动回复（队列化，确保一一对应） ==========
  const aiReplyQueueRef = useRef<string[]>([]);
  const aiReplyBusyRef = useRef(false);

  const processAIReplyQueue = useCallback(async () => {
    if (aiReplyBusyRef.current) return;
    const nextContext = aiReplyQueueRef.current.shift();
    if (!nextContext || !currentCharacter) return;

    aiReplyBusyRef.current = true;
    assistantStartedRef.current = false;
    setLoading(true);
    try {
      await streamPetAIReply(currentCharacter.id, nextContext, {
        onMood: (m) => {
          setMood(m);
          setCharacters((prev) =>
            prev.map((c) =>
              c.id === currentCharacter.id ? { ...c, mood: m } : c
            )
          );
          setCurrentCharacter((prev) => (prev ? { ...prev, mood: m } : prev));
        },
        onEmotion: (emo) => setEmotion(emo),
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
        onDone: () => {
          setLoading(false);
          aiReplyBusyRef.current = false;
          // 处理队列中的下一个
          if (aiReplyQueueRef.current.length > 0) {
            processAIReplyQueue();
          }
        },
        onError: () => {
          setLoading(false);
          aiReplyBusyRef.current = false;
          if (aiReplyQueueRef.current.length > 0) {
            processAIReplyQueue();
          }
        },
      });
    } catch {
      setLoading(false);
      aiReplyBusyRef.current = false;
      if (aiReplyQueueRef.current.length > 0) {
        processAIReplyQueue();
      }
    }
  }, [currentCharacter]);

  const handlePetAIContext = useCallback((context: string) => {
    aiReplyQueueRef.current.push(context);
    processAIReplyQueue();
  }, [processAIReplyQueue]);

  // 触发 Live2D 气泡（桌宠操作时立即显示）
  const triggerBubble = useCallback((text: string) => {
    setBubbleText({ id: Date.now(), text });
  }, []);

  // ========== 加载更早的聊天记录 ==========
  const handleLoadMore = async () => {
    if (!currentCharacter || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const msgData = await getMessages(currentCharacter.id, firstMessageId, 50);
      if (msgData.messages.length > 0) {
        const olderMessages: Message[] = msgData.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        setMessages((prev) => [...olderMessages, ...prev]);
        setFirstMessageId(msgData.messages[0].id);
        setHasMore(msgData.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error("[App] 加载更早消息失败:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  // ========== 可拖动分栏 ==========
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("splitRatio", String(splitRatio));
  }, [splitRatio]);

  useEffect(() => {
    localStorage.setItem("proactiveEnabled", String(proactiveEnabled));
  }, [proactiveEnabled]);

  // ========== 加载中 ==========
  if (loadingChars) {
    return (
      <div className="app-loading">
        <div className="app-loading-text">正在唤醒…</div>
      </div>
    );
  }

  // ========== 首次引导页 ==========
  if (onboardingActive && currentCharacter) {
    return (
      <OnboardingWizard
        character={currentCharacter}
        onComplete={(char) => {
          setOnboardingActive(false);
          handleCharacterUpdated(char);
        }}
      />
    );
  }

  return (
    <div className="app" ref={containerRef}>
      <MeteorCanvas />
      {loading && <div className="ambient-pulse" aria-hidden />}
      {/* 左侧：Live2D 立绘区 */}
      <div className="stage" style={{ flex: splitRatio }}>
        {/* 立绘顶部栏：角色选择器 */}
        <div className="stage-topbar">
          <div className="character-selector">
            <button
              className="character-selector-btn"
              onClick={() => setCharSelectorOpen((v) => !v)}
            >
              <span className="status-dot" />
              <span className="character-selector-name">
                {currentCharacter?.name || "未选择"}
              </span>
              <span className="selector-arrow">{charSelectorOpen ? "▲" : "▼"}</span>
            </button>
            {charSelectorOpen && (
              <>
                {/* 点击遮罩关闭下拉 */}
                <div className="dropdown-backdrop" onClick={() => setCharSelectorOpen(false)} />
                <div className="character-dropdown">
                  {characters.map((c) => (
                    <div
                      key={c.id}
                      className={`character-item${
                        c.id === currentCharacter?.id ? " active" : ""
                      }`}
                      onClick={() => selectCharacter(c.id, characters)}
                    >
                      <span className="character-avatar">
                        {c.name.charAt(0)}
                      </span>
                      <span className="character-item-name">{c.name}</span>
                      <span className="character-item-mood">{moodToEmoji(c.mood)}</span>
                      {characters.length > 1 && (
                        <button
                          className="character-item-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCharacter(c.id);
                          }}
                          title="删除"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <div
                    className="character-item create-new"
                    onClick={handleCreateCharacter}
                  >
                    + 新建角色
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live2D 画布 - 始终渲染，通过visible prop控制显示以避免重新加载 */}
        <div className="stage-canvas">
          {currentCharacter && (
            <Live2DCanvas
              key={currentCharacter.modelUrl}
              modelUrl={currentCharacter.modelUrl}
              mood={mood}
              emotion={emotion}
              position={{ x: 0, y: 0, scale: 1 }}
              onPositionChange={handlePositionChange}
              bubbleText={bubbleText}
              characterId={currentCharacter.id}
              petState={petState}
              onPetStateChange={setPetState}
              onAIContext={handlePetAIContext}
              onBubble={triggerBubble}
              closeSignal={closeSignal}
              visible={!settingsOpen} // 打开设置时隐藏canvas，但不卸载
            />
          )}
        </div>
      </div>

      {/* 拖动分隔条 */}
      <div className="split-divider" onMouseDown={startDrag}>
        <div className="split-divider-handle" />
      </div>

      {/* 右侧：聊天区 */}
      <div className="chat-panel" style={{ flex: 1 - splitRatio }}>
        {/* 聊天头部：状态栏 */}
        <div className="chat-header">
          <span className="chat-header-title">
            <span className="status-dot" />
            {currentCharacter?.name || ""}
          </span>
          <div className="chat-header-actions">
            <button
              className={`chat-power-btn${proactiveEnabled ? "" : " off"}`}
              onClick={toggleProactive}
              title={proactiveEnabled ? "主动消息已开启 · 点击关闭" : "主动消息已关闭 · 点击开启"}
            >
              {proactiveEnabled ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              )}
            </button>
            <button
              className="chat-clear-btn"
              onClick={handleClearChat}
              title="清空聊天记录"
              disabled={loading || messages.length <= 1}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <button
              className="settings-trigger"
              onClick={() => {
                setCloseSignal((n) => n + 1);
                setSettingsOpen(true);
              }}
              title="设置"
            >
              ⚙
            </button>
          </div>
        </div>
        <ChatWindow
          messages={messages}
          loading={loading}
          characterName={currentCharacter?.name}
          characterAvatarUrl={currentCharacter?.avatarUrl}
          userAvatarUrl={chatAppearance.userAvatarUrl}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
        />
        <ChatInput onSend={handleSend} onSendSticker={handleSendSticker} disabled={loading || !currentCharacter} />
      </div>

      {settingsOpen && currentCharacter && (
        <SettingsPage
          character={currentCharacter}
          onCharacterUpdated={handleCharacterUpdated}
          onMemoryCleared={handleMemoryCleared}
          onBack={() => setSettingsOpen(false)}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}

      {/* 心情悬浮指示器 */}
      {currentCharacter && <MoodIndicator mood={mood} />}
    </div>
  );
}
