import { useState, useEffect } from "react";

export interface UseMoodOptions {
  initialMood?: number;
}

export interface UseMoodReturn {
  mood: number;
  setMood: React.Dispatch<React.SetStateAction<number>>;
  emotion: string | null;
  setEmotion: React.Dispatch<React.SetStateAction<string | null>>;
  updateMood: (newMood: number) => void;
}

/**
 * 心情管理 Hook
 * 
 * 负责：
 * - 心情值状态管理
 * - 情感状态管理
 * - 心情联动极光色调逻辑
 * - 时间感知背景色调逻辑
 */
export function useMood(options: UseMoodOptions = {}): UseMoodReturn {
  const { initialMood = 60 } = options;

  // 心情值状态
  const [mood, setMood] = useState(initialMood);
  // 情感状态
  const [emotion, setEmotion] = useState<string | null>(null);

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

  // 更新心情值的方法
  const updateMood = (newMood: number) => {
    setMood(newMood);
  };

  return {
    mood,
    setMood,
    emotion,
    setEmotion,
    updateMood,
  };
}