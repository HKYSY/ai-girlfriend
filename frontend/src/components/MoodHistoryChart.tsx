import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getMoodHistory } from "../api";
import type { MoodPoint } from "../api";

interface MoodHistoryChartProps {
  characterId: string;
}

// 心情值 → 颜色
function moodToColor(mood: number): string {
  if (mood >= 70) return "#ff5722";
  if (mood >= 50) return "#66bb6a";
  if (mood >= 30) return "#ab47bc";
  return "#5c6bc0";
}

// 时间戳 → 简短显示（根据天数范围调整格式）
function formatTime(t: number, days: number): string {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  // 7天以上只显示月-日，1天显示时:分
  if (days >= 7) return `${mm}-${dd}`;
  return `${hh}:${mi}`;
}

export default function MoodHistoryChart({ characterId }: MoodHistoryChartProps) {
  const [history, setHistory] = useState<MoodPoint[]>([]);
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getMoodHistory(characterId, days);
        if (!cancelled) setHistory(data.history);
      } catch (e) {
        console.error("[MoodHistoryChart] 加载失败:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [characterId, days]);

  // 转换为 recharts 数据格式
  const chartData = history.map((p) => ({
    time: p.t,
    timeLabel: formatTime(p.t, days),
    mood: p.mood,
  }));

  // 计算平均心情
  const avgMood = history.length > 0
    ? Math.round(history.reduce((sum, p) => sum + p.mood, 0) / history.length)
    : 0;
  const latestMood = history.length > 0 ? history[history.length - 1].mood : 0;

  return (
    <div className="mood-chart-container">
      <div className="mood-chart-header">
        <span className="mood-chart-title">📈 心情趋势</span>
        <div className="mood-chart-days">
          <button
            className={`mood-chart-day-btn${days === 1 ? " active" : ""}`}
            onClick={() => setDays(1)}
          >
            1天
          </button>
          <button
            className={`mood-chart-day-btn${days === 7 ? " active" : ""}`}
            onClick={() => setDays(7)}
          >
            7天
          </button>
          <button
            className={`mood-chart-day-btn${days === 30 ? " active" : ""}`}
            onClick={() => setDays(30)}
          >
            30天
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mood-chart-empty">加载中...</div>
      ) : chartData.length === 0 ? (
        <div className="mood-chart-empty">暂无心情数据，多聊聊天吧～</div>
      ) : (
        <>
          <div className="mood-chart-stats">
            <span>当前: {latestMood}</span>
            <span>平均: {avgMood}</span>
            <span>数据点: {chartData.length}</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
              <defs>
                <linearGradient id="moodLineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#5c6bc0" />
                  <stop offset="50%" stopColor="#66bb6a" />
                  <stop offset="100%" stopColor="#ff5722" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="timeLabel"
                tick={{ fontSize: 9, fill: "#999" }}
                tickLine={false}
                axisLine={{ stroke: "#eee" }}
                interval={days >= 7 ? "preserveStartEnd" : 0}
                minTickGap={20}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: "#999" }}
                tickLine={false}
                axisLine={false}
                ticks={[0, 50, 100]}
              />
              <Tooltip
                contentStyle={{
                  fontSize: "11px",
                  borderRadius: "8px",
                  border: "1px solid #eee",
                  padding: "6px 10px",
                }}
                labelStyle={{ color: "#999" }}
                formatter={(value) => [`${value}`, "心情"]}
              />
              <ReferenceLine y={50} stroke="#e0e0e0" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="mood"
                stroke={moodToColor(latestMood)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: moodToColor(latestMood) }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
