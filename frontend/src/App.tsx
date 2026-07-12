import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import ChatWindow, { type Message } from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import Live2DCanvas from "./components/Live2DCanvas";
import SettingsPanel from "./components/SettingsPanel";
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
  generateDiary,
} from "./api";
import type { Character, PetState } from "./api";
import { moodToEmoji } from "./utils";

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
  const [mood, setMood] = useState(60);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [bubbleText, setBubbleText] = useState<{ id: number; text: string } | null>(null);

  // ========== UI 状态 ==========
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 强制关闭 Live2D 互动浮层的信号（每次打开设置时递增）
  const [closeSignal, setCloseSignal] = useState(0);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  // 主动消息开关（关机按钮）：false 时 AI 不会自动发消息
  const [proactiveEnabled, setProactiveEnabled] = useState(() => {
    return localStorage.getItem("proactiveEnabled") !== "false";
  });
  // ref 始终指向最新值（供 setInterval 闭包读取）
  const proactiveEnabledRef = useRef(proactiveEnabled);
  proactiveEnabledRef.current = proactiveEnabled;

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
      // 加载对话历史
      const histMessages: Message[] = detail.conversation.messages
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
      // 重置活动时间和主动消息状态
      lastActivityRef.current = Date.now();
      proactiveActiveRef.current = false;
      setCharSelectorOpen(false);
    } catch (e) {
      console.error("[App] 切换角色失败:", e);
    }
  };

  // ========== 每天首次打开时自动生成日记 ==========
  useEffect(() => {
    if (!currentCharacter) return;
    // 后端会判断今天是否已有日记，已有则直接返回，不会重复生成
    generateDiary(currentCharacter.id)
      .then((result) => {
        if (result.ok && result.entry && !result.alreadyExists) {
          console.log(`[diary] 已为 ${currentCharacter.name} 生成今日日记`);
        }
      })
      .catch((e) => console.error("[diary] 自动生成失败:", e));
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

    try {
      await streamChat(text, currentCharacter.id, {
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
        onPetState: (state, coinReward) => {
          setPetState(state);
          if (coinReward && coinReward > 0) {
            // 聊天金币奖励提示（轻量，不弹消息，仅控制台日志）
            console.log(`[pet] 聊天奖励 ${coinReward} 金币`);
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
      if (!assistantStartedRef.current) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "（网络开小差了，再说一次好吗～）" },
        ]);
      }
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
        <div className="app-loading-text">加载中…</div>
      </div>
    );
  }

  return (
    <div className="app" ref={containerRef}>
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

        {/* Live2D 画布 */}
        <div className="stage-canvas">
          {currentCharacter && (
            <Live2DCanvas
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
        />
        <ChatInput onSend={handleSend} disabled={loading || !currentCharacter} />
      </div>

      {currentCharacter && (
        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          character={currentCharacter}
          onCharacterUpdated={handleCharacterUpdated}
          onMemoryCleared={handleMemoryCleared}
        />
      )}
    </div>
  );
}
