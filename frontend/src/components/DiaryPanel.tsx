import { useState, useEffect } from "react";
import { Button, Card, Typography, Empty, Spin, message } from "antd";
import { PenLine, CheckCircle2, CalendarDays } from "lucide-react";
import { getDiary, generateDiary } from "../api";
import type { DiaryEntry } from "../api";

const { Text, Paragraph } = Typography;

interface DiaryPanelProps {
  characterId: string;
  refreshKey: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${mm}月${dd}日 ${weekdays[d.getDay()]}`;
}

function moodEmoji(mood: number): string {
  if (mood >= 90) return "😍";
  if (mood >= 70) return "😊";
  if (mood >= 50) return "🙂";
  if (mood >= 30) return "😟";
  return "😢";
}

export default function DiaryPanel({ characterId, refreshKey }: DiaryPanelProps) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);

  const loadDiary = async () => {
    setLoading(true);
    try {
      const data = await getDiary(characterId);
      setEntries(data.entries);
      if (data.entries.length > 0 && !selectedEntry) {
        setSelectedEntry(data.entries[0]);
      }
    } catch (e) {
      console.error("[DiaryPanel] 加载失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, refreshKey]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateDiary(characterId);
      if (result.ok && result.entry) {
        await loadDiary();
        setSelectedEntry(result.entry);
        message.success("日记写好了！");
      } else if (result.error) {
        message.error(result.error);
      }
    } catch (e) {
      console.error("[DiaryPanel] 生成失败:", e);
      message.error("生成日记失败");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Spin />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div>
        <Button
          type="primary"
          icon={<PenLine size={16} />}
          loading={generating}
          onClick={handleGenerate}
          block
          style={{ marginBottom: 16 }}
        >
          {generating ? "正在写日记..." : "写新日记"}
        </Button>
        <Empty description="还没有日记，多聊聊天后让她写日记吧～" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = entries.find((e) => e.date === today);
  // 统计今天日记的段落数（按时间标记【】计数）
  const todaySegments = todayEntry
    ? (todayEntry.content.match(/【[^】]+】/g) || []).length || 1
    : 0;

  return (
    <div>
      <Button
        type="primary"
        icon={<PenLine size={16} />}
        loading={generating}
        onClick={handleGenerate}
        block
        style={{ marginBottom: 12 }}
      >
        {generating ? "正在写日记..." : todayEntry ? "追加日记" : "写新日记"}
      </Button>
      {todayEntry && (
        <Card size="small" style={{ marginBottom: 12, background: "rgba(102, 187, 106, 0.08)", borderColor: "#66bb6a" }}>
          <Text style={{ color: "#66bb6a", display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={16} /> 今天日记已有 {todaySegments} 段
          </Text>
        </Card>
      )}

      <div className="diary-layout">
        {/* 日期列表 */}
        <div className="diary-list">
          {entries.map((entry) => (
            <button
              key={entry.date}
              className={`diary-list-item${selectedEntry?.date === entry.date ? " active" : ""}`}
              onClick={() => setSelectedEntry(entry)}
            >
              <CalendarDays size={14} />
              <span>{formatDate(entry.date)}</span>
              <span>{moodEmoji(entry.mood)}</span>
            </button>
          ))}
        </div>

        {/* 日记内容 */}
        {selectedEntry && (
          <Card
            size="small"
            style={{ flex: 1 }}
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong>{formatDate(selectedEntry.date)}</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {moodEmoji(selectedEntry.mood)} 心情 {selectedEntry.mood}
                </Text>
              </div>
            }
          >
            <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8 }}>
              {selectedEntry.content}
            </Paragraph>
          </Card>
        )}
      </div>
    </div>
  );
}
