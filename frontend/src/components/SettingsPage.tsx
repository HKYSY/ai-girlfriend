import { useState } from "react";
import {
  User, Palette, Cpu, Database, ArrowLeft, MessageCircle,
  Sun, Moon, Monitor
} from "lucide-react";
import SettingsRole from "./SettingsRole";
import SettingsChat from "./SettingsChat";
import SettingsAppearance from "./SettingsAppearance";
import SettingsAIModel from "./SettingsAIModel";
import SettingsData from "./SettingsData";
import type { Character } from "../api";
import type { ThemeMode } from "../theme";

type NavKey = "role" | "chat" | "appearance" | "ai" | "data";

interface Props {
  character: Character;
  onCharacterUpdated: (char: Character) => void;
  onMemoryCleared: () => void;
  onBack: () => void;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const NAV_ITEMS: { key: NavKey; label: string; icon: typeof User }[] = [
  { key: "role", label: "角色", icon: User },
  { key: "chat", label: "聊天", icon: MessageCircle },
  { key: "appearance", label: "形象", icon: Palette },
  { key: "ai", label: "AI 模型", icon: Cpu },
  { key: "data", label: "数据", icon: Database },
];

export default function SettingsPage({ character, onCharacterUpdated, onMemoryCleared, onBack, theme, onThemeChange }: Props) {
  const [activeNav, setActiveNav] = useState<NavKey>("role");

  const renderContent = () => {
    switch (activeNav) {
      case "role":
        return <SettingsRole character={character} onUpdated={onCharacterUpdated} />;
      case "chat":
        return <SettingsChat />;
      case "appearance":
        return <SettingsAppearance character={character} onUpdated={onCharacterUpdated} />;
      case "ai":
        return <SettingsAIModel character={character} onUpdated={onCharacterUpdated} />;
      case "data":
        return <SettingsData character={character} onMemoryCleared={onMemoryCleared} />;
    }
  };

  return (
    <div className="settings-page">
      {/* 侧边导航 */}
      <nav className="settings-nav">
        <button className="settings-back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>返回</span>
        </button>

        <div className="settings-nav-items">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`settings-nav-item${activeNav === item.key ? " active" : ""}`}
              onClick={() => setActiveNav(item.key)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* 主题切换 */}
        <div className="settings-theme-switcher">
          <span className="settings-theme-label">主题</span>
          <div className="settings-theme-btns">
            {([
              { mode: "light" as ThemeMode, icon: Sun, tip: "浅色" },
              { mode: "dark" as ThemeMode, icon: Moon, tip: "深色" },
              { mode: "system" as ThemeMode, icon: Monitor, tip: "跟随系统" },
            ]).map(({ mode, icon: Icon, tip }) => (
              <button
                key={mode}
                className={`settings-theme-btn${theme === mode ? " active" : ""}`}
                onClick={() => onThemeChange(mode)}
                title={tip}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* 内容区 */}
      <main className="settings-content">
        {renderContent()}
      </main>
    </div>
  );
}
