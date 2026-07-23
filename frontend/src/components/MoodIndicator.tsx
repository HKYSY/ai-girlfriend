import { useMemo, useEffect, useState } from "react";

interface MoodIndicatorProps {
  mood: number;
}

// 心情值 → emoji 映射
const MOOD_EMOJI_MAP: Array<[number, string, string]> = [
  [90, "😄", "超开心"],
  [80, "😊", "很开心"],
  [70, "🙂", "开心"],
  [60, "😐", "心情一般"],
  [50, "😐", "还行"],
  [40, "😕", "有点低落"],
  [30, "😢", "难过"],
  [20, "😢", "很难过"],
  [10, "😭", "伤心"],
  [0, "💔", "心碎"],
];

export default function MoodIndicator({ mood }: MoodIndicatorProps) {
  const [visible, setVisible] = useState(true);
  const [prevMood, setPrevMood] = useState(mood);
  const [animClass, setAnimClass] = useState("");

  // 找到对应的emoji和描述
  const { emoji, label } = useMemo(() => {
    for (const [threshold, em, lbl] of MOOD_EMOJI_MAP) {
      if (mood >= threshold) {
        return { emoji: em, label: lbl };
      }
    }
    return { emoji: "💔", label: "心碎" };
  }, [mood]);

  // 心情变化时有入场动画 + 情感化效果
  useEffect(() => {
    if (mood !== prevMood) {
      // 心情上升：弹跳+上浮效果
      if (mood > prevMood) {
        setAnimClass("mood-indicator-up");
      } else {
        // 心情下降：下沉效果
        setAnimClass("mood-indicator-down");
      }
      setVisible(false);
      const timer = setTimeout(() => {
        setVisible(true);
        setPrevMood(mood);
        // 动画完成后清除动画类
        setTimeout(() => setAnimClass(""), 400);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mood, prevMood]);

  return (
    <div
      className={`mood-indicator ${visible ? "mood-indicator-visible" : "mood-indicator-hidden"} ${animClass}`}
      aria-label={`当前心情：${label}（${mood}/100）`}
      title={`心情值：${mood}`}
    >
      <span className="mood-indicator-emoji">{emoji}</span>
      <span className="mood-indicator-value">{mood}</span>
    </div>
  );
}