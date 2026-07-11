import { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  Progress,
  InputNumber,
  Segmented,
  Card,
  Tag,
  Tooltip,
  Typography,
  Alert,
  Space,
  message,
} from "antd";
import {
  HeartPulse,
  ShoppingBag,
  Heart,
  Gamepad2,
  Trophy,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Coins,
  UtensilsCrossed,
  Moon,
  ClipboardCheck,
  Lightbulb,
  Clock,
  Play,
  RefreshCw,
  Flag,
} from "lucide-react";
import {
  getPetState,
  petSign,
  petBuy,
  petDate,
  petGame,
  petGuessStart,
  petGuess,
  petWheel,
} from "../api";
import type {
  PetState,
  ShopItem,
  DateActivity,
  PetActionResult,
} from "../api";
import MoodHistoryChart from "./MoodHistoryChart";
import AchievementsPanel from "./AchievementsPanel";
import DiaryPanel from "./DiaryPanel";
import MoodDisplay from "./MoodDisplay";

const { Text, Title } = Typography;

interface SidebarProps {
  characterId: string;
  petState: PetState | null;
  mood: number;
  onPetStateChange: (state: PetState) => void;
  onAIContext: (context: string) => void;
  onBubble: (text: string) => void;
}

type Tab = "status" | "shop" | "date" | "game" | "achievement" | "diary";
type GameSubTab = "rps" | "guess" | "wheel";

// 标签配置
const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "status", label: "状态", icon: <HeartPulse size={22} /> },
  { key: "shop", label: "商店", icon: <ShoppingBag size={22} /> },
  { key: "date", label: "约会", icon: <Heart size={22} /> },
  { key: "game", label: "游戏", icon: <Gamepad2 size={22} /> },
  { key: "achievement", label: "成就", icon: <Trophy size={22} /> },
  { key: "diary", label: "日记", icon: <BookOpen size={22} /> },
];

// ========== 幸运转盘段定义（与后端 WHEEL_SEGMENTS 一致） ==========
interface WheelSeg {
  multiplier: number;
  weight: number;
  label: string;
  emoji: string;
  color: string;
}
const WHEEL_SEGMENTS: WheelSeg[] = [
  { multiplier: 0,   weight: 45,  label: "没中",   emoji: "💔", color: "#78909c" },
  { multiplier: 1,   weight: 25,  label: "保本",   emoji: "🪙", color: "#8d6e63" },
  { multiplier: 1.5, weight: 15,  label: "×1.5",  emoji: "🥉", color: "#a1887f" },
  { multiplier: 2,   weight: 9,   label: "×2",    emoji: "🥈", color: "#90a4ae" },
  { multiplier: 3,   weight: 4,   label: "×3",    emoji: "🥇", color: "#ffd54f" },
  { multiplier: 5,   weight: 1.5, label: "×5",    emoji: "💎", color: "#4dd0e1" },
  { multiplier: 10,  weight: 0.5, label: "×10",   emoji: "👑", color: "#e91e63" },
];
const WHEEL_TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
const WHEEL_ANGLES = WHEEL_SEGMENTS.map((seg) => {
  const sweep = (seg.weight / WHEEL_TOTAL_WEIGHT) * 360;
  return { sweep };
});
let _acc = 0;
const WHEEL_SEGMENT_INFO = WHEEL_SEGMENTS.map((_seg, i) => {
  const sweep = WHEEL_ANGLES[i].sweep;
  const start = _acc;
  const end = _acc + sweep;
  const center = start + sweep / 2;
  _acc = end;
  return { start, end, center };
});
const WHEEL_GRADIENT = WHEEL_SEGMENTS.map((seg, i) => {
  const { start, end } = WHEEL_SEGMENT_INFO[i];
  return `${seg.color} ${start}deg ${end}deg`;
}).join(", ");
function calcWheelRotation(segmentIndex: number, currentRotation: number): number {
  const center = WHEEL_SEGMENT_INFO[segmentIndex].center;
  const targetBase = 360 - center;
  const minRotation = currentRotation + 360 * 5;
  const currentMod = ((minRotation % 360) + 360) % 360;
  let diff = targetBase - currentMod;
  if (diff < 0) diff += 360;
  return minRotation + diff;
}

// 状态条颜色
function getHungerColor(hunger: number): string {
  if (hunger < 20) return "#e53935";
  if (hunger < 40) return "#ff9800";
  return "#66bb6a";
}
function getFatigueColor(fatigue: number): string {
  if (fatigue > 80) return "#e53935";
  if (fatigue > 60) return "#ff9800";
  return "#66bb6a";
}
function getHungerLabel(hunger: number): string {
  if (hunger < 20) return "饿坏了";
  if (hunger < 40) return "有点饿";
  if (hunger < 70) return "还行";
  return "饱饱的";
}
function getFatigueLabel(fatigue: number): string {
  if (fatigue > 80) return "累瘫了";
  if (fatigue > 60) return "有点累";
  if (fatigue > 30) return "还好";
  return "精力充沛";
}
function getIntimacyLabel(intimacy: number): string {
  if (intimacy >= 80) return "热恋";
  if (intimacy >= 50) return "亲密";
  if (intimacy >= 30) return "熟悉";
  return "初识";
}

export default function Sidebar({
  characterId,
  petState,
  mood,
  onPetStateChange,
  onAIContext,
  onBubble,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("status");
  const [contentWidth, setContentWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
    const n = saved ? parseInt(saved, 10) : NaN;
    return !isNaN(n) && n >= 220 && n <= 560 ? n : 300;
  });
  const sidebarDragRef = useRef(false);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [dateActivities, setDateActivities] = useState<DateActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [gameResult, setGameResult] = useState<PetActionResult | null>(null);

  const [gameSubTab, setGameSubTab] = useState<GameSubTab>("rps");

  const [guessRange, setGuessRange] = useState<number>(30);
  const [guessGame, setGuessGame] = useState<{
    range: number;
    attemptsLeft: number;
    maxAttempts: number;
    finished: boolean;
    won: boolean;
    hint: "correct" | "big" | "small" | null;
    lastGuess: number | null;
    reward: number;
  } | null>(null);
  const [guessInput, setGuessInput] = useState<string>("");

  const [wheelBet, setWheelBet] = useState<string>("10");
  const [wheelResult, setWheelResult] = useState<PetActionResult | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);

  const [achievementRefreshKey, setAchievementRefreshKey] = useState(0);

  useEffect(() => {
    if (!characterId) return;
    getPetState(characterId)
      .then((data) => {
        setShopItems(data.shopItems);
        setDateActivities(data.dateActivities);
        onPetStateChange(data.petState);
      })
      .catch((e) => console.error("[Sidebar] 加载宠物状态失败:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(contentWidth));
  }, [contentWidth]);

  const startSidebarDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarDragRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!sidebarDragRef.current) return;
      const newWidth = e.clientX - 60;
      setContentWidth(Math.max(220, Math.min(560, newWidth)));
    };
    const onMouseUp = () => {
      if (sidebarDragRef.current) {
        sidebarDragRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleAction = useCallback(
    (result: PetActionResult) => {
      onPetStateChange(result.petState);
      if (result.message) {
        if (result.ok) {
          message.success(result.message);
        } else {
          message.warning(result.message);
        }
      }
      if (result.ok) {
        let bubble = "";
        if (result.result === "win") bubble = "你赢啦！再来一局嘛~";
        else if (result.result === "lose") bubble = "嘿嘿我赢了！";
        else if (result.result === "draw") bubble = "平局！不分上下~";
        else if (result.hint === "correct") bubble = "好厉害！猜中啦~";
        else if (result.hint === "big") bubble = "猜大啦~往小了想！";
        else if (result.hint === "small") bubble = "猜小啦~往大了想！";
        else if (result.multiplier !== undefined && result.multiplier >= 5) bubble = "哇！大奖！太厉害了！";
        else if (result.multiplier !== undefined && result.multiplier > 1) bubble = "中了！运气不错~";
        else if (result.multiplier === 0) bubble = "哎呀没中，下次会中的！";
        else if (result.brokeEven) bubble = "好险保本了~";
        else if (result.message.includes("签到")) bubble = "谢谢签到~";
        else if (result.message.includes("送出")) bubble = "谢谢你的礼物！";
        else if (result.message.includes("约会") || result.message.includes("一起")) bubble = "好开心呀~";
        else if (result.message.includes("没猜中")) bubble = "没关系，再来一局！";
        else bubble = "嗯嗯~";
        if (bubble) onBubble(bubble);
      }
      if (result.newAchievements && result.newAchievements.length > 0) {
        setAchievementRefreshKey((k) => k + 1);
        message.success(`🏆 解锁 ${result.newAchievements.length} 个新成就！`);
        onBubble("又解锁新成就啦！好开心~");
      }
      if (result.ok && result.aiContext) {
        onAIContext(result.aiContext);
      }
    },
    [onPetStateChange, onAIContext, onBubble]
  );

  const handleSign = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petSign(characterId);
      handleAction(result);
    } catch (e) {
      message.error("签到失败，请稍后重试");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleBuy = async (itemId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petBuy(characterId, itemId);
      handleAction(result);
    } catch (e) {
      message.error("购买失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDate = async (activityId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petDate(characterId, activityId);
      handleAction(result);
    } catch (e) {
      message.error("约会失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleGame = async (choice: "rock" | "scissors" | "paper") => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petGame(characterId, choice);
      setGameResult(result);
      handleAction(result);
    } catch (e) {
      message.error("游戏失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleGuessStart = async (range?: number) => {
    if (busy) return;
    const r = range ?? guessRange;
    setBusy(true);
    try {
      const data = await petGuessStart(characterId, r);
      setGuessGame({
        range: data.range,
        attemptsLeft: data.attemptsLeft,
        maxAttempts: data.maxAttempts,
        finished: false,
        won: false,
        hint: null,
        lastGuess: null,
        reward: 0,
      });
      setGuessInput("");
      if (data.resumed) {
        message.info(`继续进行中的游戏（1-${data.range}）`);
      }
    } catch (e) {
      message.error("开始游戏失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleGuess = async () => {
    if (busy || !guessGame || guessGame.finished) return;
    const num = parseInt(guessInput, 10);
    if (isNaN(num)) {
      message.warning("请输入数字");
      return;
    }
    setBusy(true);
    try {
      const result = await petGuess(characterId, num);
      setGuessGame({
        range: guessGame.range,
        attemptsLeft: result.attemptsLeft ?? 0,
        maxAttempts: guessGame.maxAttempts,
        finished: result.finished ?? false,
        won: result.won ?? false,
        hint: result.hint ?? null,
        lastGuess: num,
        reward: result.reward ?? 0,
      });
      setGuessInput("");
      handleAction(result);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "猜数字失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleWheel = async () => {
    if (busy || wheelSpinning) return;
    const bet = parseInt(wheelBet, 10);
    if (isNaN(bet) || bet <= 0) {
      message.warning("请输入有效的投注金额");
      return;
    }
    if ((petState?.coins ?? 0) < bet) {
      message.warning("金币不足");
      return;
    }
    setWheelSpinning(true);
    setBusy(true);
    try {
      const result = await petWheel(characterId, bet);
      const segIdx = result.segmentIndex ?? 0;
      const newRotation = calcWheelRotation(segIdx, wheelRotation);
      setWheelRotation(newRotation);
      await new Promise((resolve) => setTimeout(resolve, 3100));
      setWheelResult(result);
      handleAction(result);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "幸运转盘失败");
      console.error(e);
    } finally {
      setWheelSpinning(false);
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const signedToday = petState?.lastSignDate === today;

  return (
    <div className={`sidebar${collapsed ? " collapsed" : ""}`}>
      {/* 图标导航列 */}
      <div className="sidebar-nav">
        <Tooltip title={collapsed ? "展开" : "收起"} placement="right">
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </Tooltip>
        {TAB_CONFIG.map(({ key, label, icon }) => (
          <Tooltip key={key} title={label} placement="right">
            <button
              className={`sidebar-tab-btn${activeTab === key ? " active" : ""}`}
              onClick={() => {
                setActiveTab(key);
                setCollapsed(false);
              }}
            >
              <span className="sidebar-tab-icon">{icon}</span>
              <span className="sidebar-tab-label">{label}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      {/* 内容面板 */}
      {!collapsed && (
        <div className="sidebar-content" style={{ width: `${contentWidth}px` }}>
          <div
            className="sidebar-resize-handle"
            onMouseDown={startSidebarDrag}
          />

          {/* 金币栏 */}
          <div className="sidebar-coins">
            <Coins size={20} color="#ffd54f" />
            <span className="coin-value">{petState?.coins ?? 0}</span>
            <Text type="secondary" style={{ fontSize: 13 }}>金币</Text>
          </div>

          {/* 状态面板 */}
          {activeTab === "status" && (
            <div className="sidebar-panel">
              <Title level={5} style={{ margin: "0 0 12px 0" }}>她的状态</Title>

              <MoodDisplay mood={mood} />

              <Button
                type={signedToday ? "default" : "primary"}
                icon={<ClipboardCheck size={16} />}
                onClick={handleSign}
                disabled={busy || signedToday}
                block
                style={{ marginBottom: 16 }}
              >
                {signedToday ? "今日已签到" : "每日签到 +20"}
              </Button>

              {/* 状态条 */}
              <Space direction="vertical" style={{ width: "100%", marginBottom: 12 }} size={12}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Space>
                      <UtensilsCrossed size={16} color="#8d6e63" />
                      <Text style={{ fontSize: 13 }}>饱腹感</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {petState ? getHungerLabel(petState.hunger) : ""}
                    </Text>
                  </div>
                  <Progress
                    percent={petState?.hunger ?? 0}
                    size="small"
                    strokeColor={getHungerColor(petState?.hunger ?? 70)}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Space>
                      <Moon size={16} color="#5c6bc0" />
                      <Text style={{ fontSize: 13 }}>疲劳度</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {petState ? getFatigueLabel(petState.fatigue) : ""}
                    </Text>
                  </div>
                  <Progress
                    percent={petState?.fatigue ?? 0}
                    size="small"
                    strokeColor={getFatigueColor(petState?.fatigue ?? 20)}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Space>
                      <Heart size={16} color="#e91e63" />
                      <Text style={{ fontSize: 13 }}>亲密度</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {petState ? getIntimacyLabel(petState.intimacy) : ""}
                    </Text>
                  </div>
                  <Progress
                    percent={petState?.intimacy ?? 0}
                    size="small"
                    strokeColor="#e91e63"
                  />
                </div>
              </Space>

              <Alert
                type="info"
                showIcon
                icon={<Lightbulb size={16} />}
                message="多聊天可以赚金币，每10条消息奖励5金币"
                style={{ marginBottom: 12, fontSize: 12 }}
              />

              <MoodHistoryChart characterId={characterId} />
            </div>
          )}

          {/* 商店面板 */}
          {activeTab === "shop" && (
            <div className="sidebar-panel">
              <Title level={5} style={{ margin: "0 0 12px 0" }}>商店</Title>
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {shopItems.map((item) => {
                  const canAfford = (petState?.coins ?? 0) >= item.price;
                  return (
                    <Card
                      key={item.id}
                      size="small"
                      styles={{ body: { padding: "10px 12px" } }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 28 }}>{item.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong>{item.name}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>
                        </div>
                        <Button
                          type="primary"
                          size="small"
                          disabled={busy || !canAfford}
                          onClick={() => handleBuy(item.id)}
                        >
                          {item.price} 💰
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </Space>
            </div>
          )}

          {/* 约会面板 */}
          {activeTab === "date" && (
            <div className="sidebar-panel">
              <Title level={5} style={{ margin: "0 0 12px 0" }}>约会</Title>
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {dateActivities.map((act) => (
                  <Card
                    key={act.id}
                    size="small"
                    styles={{ body: { padding: "10px 12px" } }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 28 }}>{act.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <Text strong>{act.name}</Text>
                        <br />
                        <Tag icon={<Clock size={12} />} style={{ fontSize: 11, marginTop: 2 }}>
                          {act.duration}
                        </Tag>
                      </div>
                      <Button
                        type="primary"
                        size="small"
                        icon={<Play size={14} />}
                        disabled={busy}
                        onClick={() => handleDate(act.id)}
                      >
                        出发
                      </Button>
                    </div>
                  </Card>
                ))}
              </Space>
            </div>
          )}

          {/* 游戏面板 */}
          {activeTab === "game" && (
            <div className="sidebar-panel">
              <Segmented
                value={gameSubTab}
                onChange={(v) => setGameSubTab(v as GameSubTab)}
                options={[
                  { label: "猜拳", value: "rps" },
                  { label: "猜数字", value: "guess" },
                  { label: "转盘", value: "wheel" },
                ]}
                block
                style={{ marginBottom: 16 }}
              />

              {/* 猜拳 */}
              {gameSubTab === "rps" && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                    赢一局 +10 金币，平局 +2 金币
                  </Text>

                  {gameResult && (
                    <Card
                      size="small"
                      style={{ marginBottom: 12, textAlign: "center" }}
                      styles={{ body: { padding: 12 } }}
                    >
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 8 }}>
                        <span>你: {gameResult.userEmoji}</span>
                        <Text type="secondary">VS</Text>
                        <span>她: {gameResult.aiEmoji}</span>
                      </div>
                      <Text strong style={{
                        color: gameResult.result === "win" ? "#43a047" :
                               gameResult.result === "lose" ? "#e53935" : "#757575"
                      }}>
                        {gameResult.result === "win" && "🎉 你赢了！"}
                        {gameResult.result === "lose" && "😅 你输了～"}
                        {gameResult.result === "draw" && "🤝 平局！"}
                        {gameResult.reward ? ` +${gameResult.reward}💰` : ""}
                      </Text>
                    </Card>
                  )}

                  <Space style={{ width: "100%", justifyContent: "center" }} size={12}>
                    <Button
                      size="large"
                      disabled={busy}
                      onClick={() => handleGame("rock")}
                      style={{ width: 72, height: 72, fontSize: 32 }}
                    >
                      ✊
                    </Button>
                    <Button
                      size="large"
                      disabled={busy}
                      onClick={() => handleGame("scissors")}
                      style={{ width: 72, height: 72, fontSize: 32 }}
                    >
                      ✌️
                    </Button>
                    <Button
                      size="large"
                      disabled={busy}
                      onClick={() => handleGame("paper")}
                      style={{ width: 72, height: 72, fontSize: 32 }}
                    >
                      ✋
                    </Button>
                  </Space>
                </div>
              )}

              {/* 猜数字 */}
              {gameSubTab === "guess" && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                    猜中目标数字赢金币，剩余次数越多奖励越高
                  </Text>

                  {!guessGame?.finished && guessGame && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <Tag color="blue">范围 1-{guessGame.range}</Tag>
                      <Tag color="orange">剩余 {guessGame.attemptsLeft}/{guessGame.maxAttempts}</Tag>
                    </div>
                  )}

                  {!guessGame && (
                    <div>
                      <Text style={{ fontSize: 13, display: "block", marginBottom: 8 }}>选择难度：</Text>
                      <Segmented
                        value={guessRange}
                        onChange={(v) => setGuessRange(v as number)}
                        options={[
                          { label: "简单 1-30", value: 30 },
                          { label: "中等 1-50", value: 50 },
                          { label: "困难 1-100", value: 100 },
                        ]}
                        block
                        style={{ marginBottom: 12 }}
                      />
                      <Button
                        type="primary"
                        icon={<Play size={14} />}
                        disabled={busy}
                        onClick={() => handleGuessStart()}
                        block
                      >
                        开始游戏
                      </Button>
                    </div>
                  )}

                  {guessGame && !guessGame.finished && (
                    <div>
                      {guessGame.hint && guessGame.lastGuess !== null && (
                        <Alert
                          type={guessGame.hint === "big" ? "warning" : "info"}
                          message={`${guessGame.lastGuess} ${guessGame.hint === "big" ? "猜大了 ⬆️" : "猜小了 ⬇️"}`}
                          style={{ marginBottom: 8, fontSize: 13 }}
                          showIcon
                        />
                      )}
                      <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
                        <InputNumber
                          style={{ flex: 1 }}
                          value={guessInput ? Number(guessInput) : undefined}
                          onChange={(v) => setGuessInput(v ? String(v) : "")}
                          onPressEnter={handleGuess}
                          placeholder={`1-${guessGame.range}`}
                          min={1}
                          max={guessGame.range}
                          disabled={busy}
                        />
                        <Button
                          type="primary"
                          disabled={busy || !guessInput}
                          onClick={handleGuess}
                        >
                          猜
                        </Button>
                      </Space.Compact>
                      <Button
                        size="small"
                        danger
                        type="text"
                        icon={<Flag size={14} />}
                        disabled={busy}
                        onClick={() => {
                          if (confirm("放弃这局？将无法获得奖励")) {
                            setGuessGame(null);
                            setGuessInput("");
                          }
                        }}
                      >
                        放弃重开
                      </Button>
                    </div>
                  )}

                  {guessGame?.finished && (
                    <Card
                      style={{ textAlign: "center", marginBottom: 12 }}
                      styles={{ body: { padding: 16 } }}
                    >
                      <div style={{ fontSize: 40, marginBottom: 8 }}>
                        {guessGame.won ? "🎉" : "😢"}
                      </div>
                      <Text strong style={{ display: "block", marginBottom: 12 }}>
                        {guessGame.won
                          ? `猜中了！获得 ${guessGame.reward} 金币`
                          : "没猜中，下次加油！"}
                      </Text>
                      <Button
                        type="primary"
                        icon={<RefreshCw size={14} />}
                        disabled={busy}
                        onClick={() => handleGuessStart()}
                      >
                        再来一局
                      </Button>
                    </Card>
                  )}
                </div>
              )}

              {/* 幸运转盘 */}
              {gameSubTab === "wheel" && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                    投注金币旋转转盘，中了按倍数奖励，没中扣除本金
                  </Text>

                  {/* 真实转盘 */}
                  <div className="wheel-stage">
                    <div className="wheel-pointer" />
                    <div
                      className="wheel-circle"
                      style={{
                        background: `conic-gradient(${WHEEL_GRADIENT})`,
                        transform: `rotate(${wheelRotation}deg)`,
                        transition: wheelSpinning
                          ? "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                          : "none",
                      }}
                    >
                      {WHEEL_SEGMENTS.map((seg, i) => {
                        const { center } = WHEEL_SEGMENT_INFO[i];
                        return (
                          <div
                            key={i}
                            className="wheel-label"
                            style={{ transform: `rotate(${center}deg) translateY(-95px)` }}
                          >
                            <span className="wheel-label-emoji">{seg.emoji}</span>
                            <span className="wheel-label-text">{seg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="wheel-center">
                      {wheelSpinning ? "🎯" : wheelResult ? wheelResult.segmentEmoji : "🎰"}
                    </div>
                  </div>

                  {wheelResult && !wheelSpinning && (
                    <div
                      className="wheel-result-banner"
                      style={{ borderColor: wheelResult.segmentColor }}
                    >
                      <span className="wheel-result-emoji">{wheelResult.segmentEmoji}</span>
                      <span className="wheel-result-label">{wheelResult.segmentLabel}</span>
                      <span className="wheel-result-net" style={{
                        color: (wheelResult.netChange ?? 0) >= 0 ? "#43a047" : "#e53935"
                      }}>
                        {(wheelResult.netChange ?? 0) >= 0 ? "+" : ""}{wheelResult.netChange}💰
                      </span>
                    </div>
                  )}

                  <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
                    <InputNumber
                      style={{ flex: 1 }}
                      value={wheelBet ? Number(wheelBet) : undefined}
                      onChange={(v) => setWheelBet(v ? String(v) : "")}
                      placeholder="投注金额"
                      min={1}
                      max={petState?.coins ?? 0}
                      disabled={busy || wheelSpinning}
                    />
                    <Button
                      type="primary"
                      disabled={busy || wheelSpinning}
                      onClick={handleWheel}
                    >
                      {wheelSpinning ? "旋转中..." : "旋转"}
                    </Button>
                  </Space.Compact>

                  <Space style={{ width: "100%" }} size={4}>
                    {[10, 50, 100].map((amt) => (
                      <Button
                        key={amt}
                        size="small"
                        disabled={busy}
                        onClick={() => setWheelBet(String(amt))}
                        style={{ flex: 1 }}
                      >
                        {amt}
                      </Button>
                    ))}
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => setWheelBet(String(petState?.coins ?? 0))}
                      style={{ flex: 1 }}
                    >
                      全部
                    </Button>
                  </Space>
                </div>
              )}
            </div>
          )}

          {/* 成就面板 */}
          {activeTab === "achievement" && (
            <div className="sidebar-panel">
              <Title level={5} style={{ margin: "0 0 12px 0" }}>成就</Title>
              <AchievementsPanel
                characterId={characterId}
                refreshKey={achievementRefreshKey}
              />
            </div>
          )}

          {/* 日记面板 */}
          {activeTab === "diary" && (
            <div className="sidebar-panel">
              <Title level={5} style={{ margin: "0 0 12px 0" }}>她的日记</Title>
              <DiaryPanel
                characterId={characterId}
                refreshKey={achievementRefreshKey}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
