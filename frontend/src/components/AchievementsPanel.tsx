import { useState, useEffect } from "react";
import { Card, Progress, Tag, Typography, Empty, Spin, Space } from "antd";
import { Trophy, CheckCircle2, Star } from "lucide-react";
import { getAchievements } from "../api";
import type { AchievementInfo } from "../api";

const { Text } = Typography;

interface AchievementsPanelProps {
  characterId: string;
  refreshKey: number;
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
    <div>
      {/* 总进度 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <Space>
            <Trophy size={18} color="#e91e63" />
            <Text strong>{unlockedCount}/{totalTiers}</Text>
          </Space>
          <Text type="secondary">{progressPercent}%</Text>
        </div>
        <Progress percent={progressPercent} strokeColor="#e91e63" size="small" />
      </Card>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : achievements.length === 0 ? (
        <Empty description="暂无成就数据" />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          {achievements.map((ach) => {
            const nextTierIndex = ach.tiers.findIndex((t) => !t.unlocked);
            const currentTierIndex = nextTierIndex === -1 ? ach.tiers.length - 1 : nextTierIndex;
            const currentTier = ach.tiers[currentTierIndex];
            const prevThreshold = currentTierIndex > 0 ? ach.tiers[currentTierIndex - 1].threshold : 0;
            const allUnlocked = nextTierIndex === -1;
            const tierProgress = allUnlocked
              ? 100
              : Math.min(100, Math.round(((ach.currentValue - prevThreshold) / (currentTier.threshold - prevThreshold)) * 100));

            return (
              <Card
                key={ach.baseId}
                size="small"
                styles={{ body: { padding: "10px 12px" } }}
                style={allUnlocked ? { borderColor: "#66bb6a", background: "rgba(102, 187, 106, 0.05)" } : {}}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>{ach.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <Text strong>{ach.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {ach.desc} · {CATEGORY_LABELS[ach.category]}
                    </Text>
                  </div>
                  {allUnlocked && <CheckCircle2 size={20} color="#66bb6a" />}
                </div>
                <div style={{ marginBottom: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {allUnlocked
                      ? `已全部达成 (${ach.currentValue})`
                      : `${ach.currentValue} / ${currentTier.threshold} - ${currentTier.title}`}
                  </Text>
                  <Progress
                    percent={tierProgress}
                    size="small"
                    strokeColor={allUnlocked ? "#66bb6a" : "#e91e63"}
                    showInfo={false}
                  />
                </div>
                <Space size={4}>
                  {ach.tiers.map((tier) => (
                    <Tag
                      key={tier.threshold}
                      icon={tier.unlocked ? <Star size={10} fill="currentColor" /> : undefined}
                      color={tier.unlocked ? "gold" : "default"}
                      style={{ fontSize: 11 }}
                    >
                      {tier.threshold}
                    </Tag>
                  ))}
                </Space>
              </Card>
            );
          })}
        </Space>
      )}
    </div>
  );
}
