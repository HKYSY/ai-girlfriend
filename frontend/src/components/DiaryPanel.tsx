import { useState, useEffect } from "react";
import { getDiary, generateDiary } from "../api";
import type { DiaryEntry } from "../api";

interface DiaryPanelProps {
  characterId: string;
  refreshKey: number;
}

// 日期格式化：YYYY-MM-DD → MM月DD日 周X
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${mm}月${dd}日 ${weekdays[d.getDay()]}`;
}

// 心情 → emoji
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
  const [hasToday, setHasToday] = useState(false);

  const loadDiary = async () => {
    setLoading(true);
    try {
      const data = await getDiary(characterId);
      setEntries(data.entries);
      setHasToday(data.hasToday);
      // 默认选中第一篇（最新的）
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

  // 手动生成今天的日记
  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateDiary(characterId);
      if (result.ok && result.entry) {
        await loadDiary();
        setSelectedEntry(result.entry);
      } else if (result.error) {
        alert(result.error);
      }
    } catch (e) {
      console.error("[DiaryPanel] 生成失败:", e);
      alert("生成日记失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="diary-container">
      {/* 生成今天的日记 */}
      {!hasToday && (
        <button
          className="diary-generate-btn"
          disabled={generating}
          onClick={handleGenerate}
        >
          {generating ? "✍️ 正在写日记..." : "📝 写今天的日记"}
        </button>
      )}
      {hasToday && (
        <div className="diary-today-badge">✓ 今天的日记已写好</div>
      )}

      {/* 日记列表 */}
      {loading ? (
        <div className="diary-loading">加载中...</div>
      ) : entries.length === 0 ? (
        <div className="diary-empty">
          还没有日记，多聊聊天后点击上方按钮让她写日记吧～
        </div>
      ) : (
        <div className="diary-layout">
          {/* 日期列表 */}
          <div className="diary-list">
            {entries.map((entry) => (
              <button
                key={entry.date}
                className={`diary-list-item${selectedEntry?.date === entry.date ? " active" : ""}`}
                onClick={() => setSelectedEntry(entry)}
              >
                <span className="diary-list-date">{formatDate(entry.date)}</span>
                <span className="diary-list-mood">{moodEmoji(entry.mood)}</span>
              </button>
            ))}
          </div>

          {/* 日记内容 */}
          {selectedEntry && (
            <div className="diary-content">
              <div className="diary-content-header">
                <span className="diary-content-date">
                  {formatDate(selectedEntry.date)}
                </span>
                <span className="diary-content-mood">
                  {moodEmoji(selectedEntry.mood)} 心情 {selectedEntry.mood}
                </span>
              </div>
              <div className="diary-content-text">
                {selectedEntry.content}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
