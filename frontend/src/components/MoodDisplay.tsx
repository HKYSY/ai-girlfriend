// 心情值显示组件：进度条 + 表情符号 + 数值

interface MoodDisplayProps {
  mood: number; // 0-100
}

// 根据心情值返回表情符号和等级标签
function getMoodInfo(mood: number): { emoji: string; label: string; color: string } {
  if (mood >= 90) return { emoji: "😍", label: "非常开心", color: "#e91e63" };
  if (mood >= 70) return { emoji: "😊", label: "开心", color: "#ff7043" };
  if (mood >= 50) return { emoji: "😌", label: "平静", color: "#66bb6a" };
  if (mood >= 30) return { emoji: "😟", label: "有点不开心", color: "#ab47bc" };
  return { emoji: "😢", label: "很难过", color: "#5c6bc0" };
}

export default function MoodDisplay({ mood }: MoodDisplayProps) {
  const { emoji, label, color } = getMoodInfo(mood);
  const clamped = Math.max(0, Math.min(100, mood));

  return (
    <div className="mood-display" title={`心情值：${clamped}/100`}>
      <span className="mood-emoji">{emoji}</span>
      <div className="mood-bar-wrap">
        <div
          className="mood-bar-fill"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span className="mood-value" style={{ color }}>
        {clamped}
      </span>
    </div>
  );
}
