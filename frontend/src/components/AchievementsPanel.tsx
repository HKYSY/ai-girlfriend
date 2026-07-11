import { useState, useEffect } from "react";
import { getAchievements } from "../api";
import type { AchievementInfo } from "../api";

interface AchievementsPanelProps {
  characterId: string;
  refreshKey: number; // 外部触发刷新
}

const CATEGORY_LABELS: Record<string, string> = {
  chat: "聊天",
  sign: "签到",
  date: "约会",
  game: "游戏",
  coin: "金币",
  intimacy: "亲密度",
};

export default function AchievementsPanel({ characterId, refreshKey }: AchievementsPanelProps) {
  const [achievements, setAchievements] = useState<AchievementInfo[]>([]);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [totalTiers, setTotalTiers] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAchievements(characterId);
        if (!cancelled) {
          setAchievements(data.achievements);
          setUnlockedCount(data.unlockedCount);
          setTotalTiers(data.totalTiers);
        }
      } catch (e) {
        console.error("[AchievementsPanel] 加载失败:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [characterId, refreshKey]);

  const progressPercent = totalTiers > 0 ? Math.round((unlockedCount / totalTiers) * 100) : 0;

  return (
    <div className="achievements-container">
      {/* 总进度 */}
      <div className="achievements-summary">
        <div className="achievements-progress-info">
          <span className="achievements-count">🏆 {unlockedCount}/{totalTiers}</span>
          <span className="achievements-percent">{progressPercent}%</span>
        </div>
        <div className="achievements-progress-bar">
          <div
            className="achievements-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 成就列表 */}
      {loading ? (
        <div className="achievements-loading">加载中...</div>
      ) : (
        <div className="achievements-list">
          {achievements.map((ach) => {
            // 找到当前档位（最后一个已解锁的下一档，或最高档）
            const nextTierIndex = ach.tiers.findIndex((t) => !t.unlocked);
            const currentTierIndex = nextTierIndex === -1 ? ach.tiers.length - 1 : nextTierIndex;
            const currentTier = ach.tiers[currentTierIndex];
            const prevThreshold = currentTierIndex > 0 ? ach.tiers[currentTierIndex - 1].threshold : 0;
            const allUnlocked = nextTierIndex === -1;
            const tierProgress = allUnlocked
              ? 100
              : Math.min(100, Math.round(((ach.currentValue - prevThreshold) / (currentTier.threshold - prevThreshold)) * 100));

            return (
              <div key={ach.baseId} className={`achievement-card${allUnlocked ? " completed" : ""}`}>
                <div className="achievement-header">
                  <span className="achievement-emoji">{ach.emoji}</span>
                  <div className="achievement-info">
                    <span className="achievement-name">{ach.name}</span>
                    <span className="achievement-desc">{ach.desc} · {CATEGORY_LABELS[ach.category]}</span>
                  </div>
                  {allUnlocked && <span className="achievement-check">✓</span>}
                </div>
                {/* 当前档位进度 */}
                <div className="achievement-tier-progress">
                  <div className="achievement-tier-label">
                    {allUnlocked
                      ? `已全部达成 (${ach.currentValue})`
                      : `${ach.currentValue} / ${currentTier.threshold} - ${currentTier.title}`}
                  </div>
                  <div className="achievement-tier-bar">
                    <div
                      className="achievement-tier-fill"
                      style={{
                        width: `${tierProgress}%`,
                        background: allUnlocked ? "#66bb6a" : "#e91e63",
                      }}
                    />
                  </div>
                </div>
                {/* 档位标记 */}
                <div className="achievement-tiers">
                  {ach.tiers.map((tier) => (
                    <span
                      key={tier.threshold}
                      className={`achievement-tier-badge${tier.unlocked ? " unlocked" : ""}`}
                      title={tier.title}
                    >
                      {tier.unlocked ? "★" : "☆"} {tier.threshold}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
