import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import ChatWindow, { type Message } from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import Live2DCanvas from "./components/Live2DCanvas";
import MoodDisplay from "./components/MoodDisplay";
import SettingsPanel from "./components/SettingsPanel";
import { streamChat } from "./api";
import type { PersonaSettings } from "./api";

const DEFAULT_MODEL_URL = "/live2d/haru/Haru.model3.json";
const SESSION_ID = "session-" + Math.random().toString(36).slice(2);

const DEFAULT_PERSONA: PersonaSettings = {
  name: "小念",
  personalityTemplate: "gentle",
  customPersonality: "",
};

// localStorage 读写
function loadPersona(): PersonaSettings {
  try {
    const saved = localStorage.getItem("persona");
    if (saved) return { ...DEFAULT_PERSONA, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_PERSONA;
}

function loadModelUrl(): string {
  return localStorage.getItem("modelUrl") || DEFAULT_MODEL_URL;
}

function loadSplitRatio(): number {
  const saved = localStorage.getItem("splitRatio");
  const n = saved ? parseFloat(saved) : NaN;
  if (!isNaN(n) && n >= 0.2 && n <= 0.8) return n;
  return 0.55; // 默认 Live2D 占 55%
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "亲爱的你来啦～今天过得怎么样呀？" },
  ]);
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState(60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [persona, setPersona] = useState<PersonaSettings>(loadPersona);
  const [modelUrl, setModelUrl] = useState<string>(loadModelUrl);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);

  // 用于流式接收时追踪是否已开始 assistant 消息
  const assistantStartedRef = useRef(false);

  // 持久化设置
  useEffect(() => {
    localStorage.setItem("persona", JSON.stringify(persona));
  }, [persona]);
  useEffect(() => {
    localStorage.setItem("modelUrl", modelUrl);
  }, [modelUrl]);
  useEffect(() => {
    localStorage.setItem("splitRatio", String(splitRatio));
  }, [splitRatio]);

  const handleSend = async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    assistantStartedRef.current = false;

    try {
      await streamChat(text, SESSION_ID, persona, {
        onMood: (m) => setMood(m),
        onText: (chunk) => {
          if (!assistantStartedRef.current) {
            assistantStartedRef.current = true;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: chunk },
            ]);
            setLoading(false);
          } else {
            // 追加到最后一条 assistant 消息
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
        },
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

  return (
    <div className="app" ref={containerRef}>
      {/* 左侧：Live2D 立绘区 */}
      <div className="stage" style={{ flex: splitRatio }}>
        <Live2DCanvas modelUrl={modelUrl} mood={mood} />
        <div className="mood-overlay">
          <MoodDisplay mood={mood} />
        </div>
      </div>

      {/* 拖动分隔条 */}
      <div className="split-divider" onMouseDown={startDrag}>
        <div className="split-divider-handle" />
      </div>

      {/* 右侧：聊天区 */}
      <div className="chat-panel" style={{ flex: 1 - splitRatio }}>
        <div className="chat-header">
          <span className="status-dot" />
          {persona.name}
          <button
            className="settings-trigger"
            onClick={() => setSettingsOpen(true)}
            title="设置"
          >
            ⚙
          </button>
        </div>
        <ChatWindow messages={messages} loading={loading} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        persona={persona}
        onPersonaChange={setPersona}
        currentModelUrl={modelUrl}
        onModelChange={setModelUrl}
      />
    </div>
  );
}
