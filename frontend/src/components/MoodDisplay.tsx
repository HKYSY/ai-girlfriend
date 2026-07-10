// 心情值显示组件：10级心情，进度条 + 表情符号 + 数值
import { getMoodLevelInfo } from "../api";

interface MoodDisplayProps {
  mood: number; // 0-100
}

export default function MoodDisplay({ mood }: MoodDisplayProps) {
  const info = getMoodLevelInfo(mood);
  const clamped = Math.max(0, Math.min(100, mood));

  return (
    <div className="mood-display" title={`心情：${info.label}（${clamped}/100）`}>
      <span className="mood-emoji">{info.emoji}</span>
      <div className="mood-bar-wrap">
        <div
          className="mood-bar-fill"
          style={{ width: `${clamped}%`, background: info.color }}
        />
      </div>
      <span className="mood-value" style={{ color: info.color }}>
        {clamped}
      </span>
    </div>
  );
}
