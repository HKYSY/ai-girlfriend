import { useState, useEffect } from "react";
import { Button, Typography, Popconfirm, message, Spin, Empty } from "antd";
import { Eraser, Download, Users, MessageCircle, CalendarDays, RefreshCw } from "lucide-react";
import { getStats, exportConversation, clearConversation } from "../api";
import type { Character, CharacterStat } from "../api";

const { Text } = Typography;

interface Props {
  character: Character;
  onMemoryCleared: () => void;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

function moodEmoji(mood: number): string {
  if (mood >= 90) return "😍";
  if (mood >= 70) return "😊";
  if (mood >= 50) return "🙂";
  if (mood >= 30) return "😟";
  return "😢";
}

export default function SettingsData({ character, onMemoryCleared }: Props) {
  const [stats, setStats] = useState<CharacterStat[]>([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    getStats()
      .then((d) => {
        setStats(d.stats);
        setTotalMessages(d.totalMessages);
        setTotalDays(d.totalDays);
      })
      .catch(() => message.error("获取数据遇到了问题"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const currentStat = stats.find((s) => s.id === character.id);
  const currentMsgCount = currentStat?.msgCount ?? 0;

  const handleClear = async () => {
    if (currentMsgCount === 0) {
      message.info("这里还是空的呢");
      return;
    }
    try {
      await clearConversation(character.id);
      onMemoryCleared();
      load();
      message.success("已经帮她忘记啦");
    } catch {
      message.error("清空时出了点问题");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportConversation(character.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${character.name}-对话记录.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success("对话记录已保存");
    } catch {
      message.error("保存时出了点问题");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="settings-loading"><Spin /></div>;

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">数据管理</h2>

      {/* 全局统计 */}
      <div className="settings-stats">
        <div className="settings-stat-item">
          <div className="settings-stat-icon"><Users size={16} /></div>
          <Text type="secondary" style={{ fontSize: 12 }}>角色总数</Text>
          <Text strong style={{ fontSize: 26 }}>{stats.length}</Text>
        </div>
        <div className="settings-stat-item">
          <div className="settings-stat-icon"><MessageCircle size={16} /></div>
          <Text type="secondary" style={{ fontSize: 12 }}>总消息数</Text>
          <Text strong style={{ fontSize: 26 }}>{totalMessages}</Text>
        </div>
        <div className="settings-stat-item">
          <div className="settings-stat-icon"><CalendarDays size={16} /></div>
          <Text type="secondary" style={{ fontSize: 12 }}>累计陪伴</Text>
          <Text strong style={{ fontSize: 26 }}>{totalDays}<span style={{ fontSize: 13, fontWeight: 500 }}> 天</span></Text>
        </div>
      </div>

      {/* 所有角色数据总览 */}
      <div className="settings-subsection">
        <div className="data-subsection-head">
          <h3 className="settings-subsection-title" style={{ marginBottom: 0 }}>所有角色数据</h3>
          <Button size="small" type="text" icon={<RefreshCw size={13} />} onClick={load}>刷新</Button>
        </div>

        {stats.length === 0 ? (
          <Empty description="还没有角色" style={{ margin: "24px 0" }} />
        ) : (
          <div className="data-char-list">
            {stats.map((s) => (
              <div
                key={s.id}
                className={`data-char-row${s.id === character.id ? " current" : ""}`}
              >
                <div className="data-char-avatar">{s.name.charAt(0) || "?"}</div>
                <div className="data-char-info">
                  <div className="data-char-name">
                    {s.name}
                    {s.id === character.id && <span className="data-char-tag">当前</span>}
                  </div>
                  <div className="data-char-meta">
                    {moodEmoji(s.mood)} 心情 {s.mood} · 最近 {relativeTime(s.lastActiveTime)}
                  </div>
                </div>
                <div className="data-char-nums">
                  <div className="data-char-num"><strong>{s.msgCount}</strong> 条消息</div>
                  <div className="data-char-days">陪伴 {s.daysAgo} 天</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 当前角色操作 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">当前角色 · {character.name}</h3>
        <div className="data-actions">
          <Button
            icon={<Download size={14} />}
            onClick={handleExport}
            loading={exporting}
            disabled={currentMsgCount === 0}
          >
            导出对话记录
          </Button>
          {currentMsgCount === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>暂无聊天记录可导出</Text>
          )}
        </div>
      </div>

      {/* 危险操作 */}
      <div className="settings-danger-zone">
        <Text strong style={{ fontSize: 14, color: "var(--color-accent-danger)" }}>⚠️ 危险操作</Text>
        <Text type="secondary" style={{ fontSize: 12, margin: "4px 0 12px", display: "block" }}>
          清空后 {character.name} 的所有聊天记忆将消失，此操作不可恢复
        </Text>
        <Popconfirm
          title={`确定要清空 ${character.name} 的所有记忆？`}
          description={currentMsgCount ? `将删除 ${currentMsgCount} 条聊天记录，无法恢复` : "没有聊天记录可清空"}
          onConfirm={handleClear}
          okText="确定清空"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<Eraser size={14} />} disabled={currentMsgCount === 0}>
            {currentMsgCount === 0 ? "暂无聊天记录" : `清空 ${character.name} 的记忆`}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}
