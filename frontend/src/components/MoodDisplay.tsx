// 心情值显示组件：10级心情，进度条 + 表情符号 + 数值
import { Progress, Typography } from "antd";
import { getMoodLevelInfo } from "../api";

const { Text } = Typography;

interface MoodDisplayProps {
  mood: number; // 0-100
}

export default function MoodDisplay({ mood }: MoodDisplayProps) {
  const info = getMoodLevelInfo(mood);
  const clamped = Math.max(0, Math.min(100, mood));

  return (
    <div className="mood-display" title={`心情：${info.label}（${clamped}/100）`}>
      <span className="mood-emoji">{info.emoji}</span>
      <Progress
        percent={clamped}
        size="small"
        strokeColor={info.color}
        style={{ flex: 1, minWidth: 0 }}
        showInfo={false}
      />
      <Text style={{ color: info.color, fontWeight: 700, fontSize: 13, minWidth: 28, textAlign: "right" }}>
        {clamped}
      </Text>
    </div>
  );
}
