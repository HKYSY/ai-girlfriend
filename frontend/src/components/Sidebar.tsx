import { useState, useEffect, useCallback, useRef } from "react";
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
// 总权重
const WHEEL_TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
// 计算每个扇区的角度范围和中心角度
const WHEEL_ANGLES = WHEEL_SEGMENTS.map((seg) => {
  const sweep = (seg.weight / WHEEL_TOTAL_WEIGHT) * 360;
  return { sweep };
});
// 累积起始角度
let _acc = 0;
const WHEEL_SEGMENT_INFO = WHEEL_SEGMENTS.map((_seg, i) => {
  const sweep = WHEEL_ANGLES[i].sweep;
  const start = _acc;
  const end = _acc + sweep;
  const center = start + sweep / 2;
  _acc = end;
  return { start, end, center };
});
// 生成 conic-gradient 字符串
const WHEEL_GRADIENT = WHEEL_SEGMENTS.map((seg, i) => {
  const { start, end } = WHEEL_SEGMENT_INFO[i];
  return `${seg.color} ${start}deg ${end}deg`;
}).join(", ");
// 计算指针指向某扇区时转盘需要的旋转角度（指针在顶部 0°位置）
function calcWheelRotation(segmentIndex: number, currentRotation: number): number {
  const center = WHEEL_SEGMENT_INFO[segmentIndex].center;
  // 需要让 center 旋转到 0°（顶部），即旋转 (360 - center) 度
  // 加上至少 5 圈完整旋转，且确保总是向前转（递增）
  const targetBase = 360 - center;
  const minRotation = currentRotation + 360 * 5; // 至少多转 5 圈
  // 找到大于 minRotation 且 mod 360 === targetBase 的角度
  const currentMod = ((minRotation % 360) + 360) % 360;
  let diff = targetBase - currentMod;
  if (diff < 0) diff += 360;
  return minRotation + diff;
}

// 状态条颜色判断
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
function getIntimacyColor(): string {
  return "#e91e63";
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
  // 侧边栏内容区宽度（可拖拽调整，持久化到 localStorage）
  const [contentWidth, setContentWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
    const n = saved ? parseInt(saved, 10) : NaN;
    return !isNaN(n) && n >= 240 && n <= 480 ? n : 280;
  });
  const sidebarDragRef = useRef(false);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [dateActivities, setDateActivities] = useState<DateActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<PetActionResult | null>(null);

  // 游戏子标签
  const [gameSubTab, setGameSubTab] = useState<GameSubTab>("rps");

  // 猜数字游戏状态
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

  // 幸运转盘状态
  const [wheelBet, setWheelBet] = useState<string>("10");
  const [wheelResult, setWheelResult] = useState<PetActionResult | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);

  // 成就刷新 key（操作后递增以刷新成就面板）
  const [achievementRefreshKey, setAchievementRefreshKey] = useState(0);

  // 加载商店和约会数据
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

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 持久化侧边栏宽度
  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(contentWidth));
  }, [contentWidth]);

  // 侧边栏拖拽调整宽度
  const startSidebarDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarDragRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!sidebarDragRef.current) return;
      // 计算宽度：鼠标 x 坐标 - 侧边栏左边缘（60px 导航栏宽度）
      const newWidth = e.clientX - 60;
      setContentWidth(Math.max(240, Math.min(480, newWidth)));
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

  // 执行操作后的通用处理
  const handleAction = useCallback(
    (result: PetActionResult) => {
      onPetStateChange(result.petState);
      if (result.message) setToast(result.message);
      // 操作成功时触发 Live2D 气泡
      if (result.ok) {
        // 根据操作结果生成气泡文字
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
      // 成就解锁通知
      if (result.newAchievements && result.newAchievements.length > 0) {
        setAchievementRefreshKey((k) => k + 1);
        setToast(`🏆 解锁 ${result.newAchievements.length} 个新成就！`);
        onBubble("又解锁新成就啦！好开心~");
      }
      if (result.ok && result.aiContext) {
        onAIContext(result.aiContext);
      }
    },
    [onPetStateChange, onAIContext, onBubble]
  );

  // 签到
  const handleSign = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petSign(characterId);
      handleAction(result);
    } catch (e) {
      setToast("签到失败，请稍后重试");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // 购买商品
  const handleBuy = async (itemId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petBuy(characterId, itemId);
      handleAction(result);
    } catch (e) {
      setToast("购买失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // 约会
  const handleDate = async (activityId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petDate(characterId, activityId);
      handleAction(result);
    } catch (e) {
      setToast("约会失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // 猜拳
  const handleGame = async (choice: "rock" | "scissors" | "paper") => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await petGame(characterId, choice);
      setGameResult(result);
      handleAction(result);
    } catch (e) {
      setToast("游戏失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // 猜数字：开始新游戏
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
        setToast(`继续进行中的游戏（1-${data.range}）`);
      }
    } catch (e) {
      setToast("开始游戏失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // 猜数字：提交猜测
  const handleGuess = async () => {
    if (busy || !guessGame || guessGame.finished) return;
    const num = parseInt(guessInput, 10);
    if (isNaN(num)) {
      setToast("请输入数字");
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
      setToast(e instanceof Error ? e.message : "猜数字失败");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // 幸运转盘：投注并旋转
  const handleWheel = async () => {
    if (busy || wheelSpinning) return;
    const bet = parseInt(wheelBet, 10);
    if (isNaN(bet) || bet <= 0) {
      setToast("请输入有效的投注金额");
      return;
    }
    if ((petState?.coins ?? 0) < bet) {
      setToast("金币不足");
      return;
    }
    setWheelSpinning(true);
    setBusy(true);
    try {
      const result = await petWheel(characterId, bet);
      // 根据结果扇区计算旋转角度
      const segIdx = result.segmentIndex ?? 0;
      const newRotation = calcWheelRotation(segIdx, wheelRotation);
      setWheelRotation(newRotation);
      // 等待转盘动画结束（CSS transition 3秒）
      await new Promise((resolve) => setTimeout(resolve, 3100));
      setWheelResult(result);
      handleAction(result);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "幸运转盘失败");
      console.error(e);
    } finally {
      setWheelSpinning(false);
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const signedToday = petState?.lastSignDate === today;

  // 图标按钮
  const TabButton = ({ tab, label }: { tab: Tab; label: string }) => (
    <button
      className={`sidebar-tab-btn${activeTab === tab ? " active" : ""}`}
      onClick={() => {
        setActiveTab(tab);
        setCollapsed(false);
      }}
      title={label}
    >
      <span className="sidebar-tab-icon">{getTabIcon(tab)}</span>
      <span className="sidebar-tab-label">{label}</span>
    </button>
  );

  return (
    <div className={`sidebar${collapsed ? " collapsed" : ""}`}>
      {/* 图标导航列 */}
      <div className="sidebar-nav">
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "展开" : "收起"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
        <TabButton tab="status" label="状态" />
        <TabButton tab="shop" label="商店" />
        <TabButton tab="date" label="约会" />
        <TabButton tab="game" label="游戏" />
        <TabButton tab="achievement" label="成就" />
        <TabButton tab="diary" label="日记" />
      </div>

      {/* 内容面板 */}
      {!collapsed && (
        <div className="sidebar-content" style={{ width: `${contentWidth}px` }}>
          {/* 拖拽调整宽度的手柄 */}
          <div
            className="sidebar-resize-handle"
            onMouseDown={startSidebarDrag}
            title="拖拽调整宽度"
          />
          {/* 金币栏（始终显示在顶部） */}
          <div className="sidebar-coins">
            <span className="coin-icon">💰</span>
            <span className="coin-value">{petState?.coins ?? 0}</span>
            <span className="coin-label">金币</span>
          </div>

          {/* 状态面板 */}
          {activeTab === "status" && (
            <div className="sidebar-panel">
              <h3 className="panel-title">她的状态</h3>

              {/* 心情值 */}
              <MoodDisplay mood={mood} />

              {/* 签到 */}
              <button
                className={`sign-btn${signedToday ? " signed" : ""}`}
                onClick={handleSign}
                disabled={busy || signedToday}
              >
                {signedToday ? "✓ 今日已签到" : "📋 每日签到 +20"}
              </button>

              {/* 状态条 */}
              <div className="status-bars">
                <div className="status-row">
                  <div className="status-row-label">
                    <span>🍖 饱腹感</span>
                    <span>{petState ? getHungerLabel(petState.hunger) : ""}</span>
                  </div>
                  <div className="status-bar">
                    <div
                      className="status-bar-fill"
                      style={{
                        width: `${petState?.hunger ?? 0}%`,
                        background: getHungerColor(petState?.hunger ?? 70),
                      }}
                    />
                  </div>
                </div>

                <div className="status-row">
                  <div className="status-row-label">
                    <span>😴 疲劳度</span>
                    <span>{petState ? getFatigueLabel(petState.fatigue) : ""}</span>
                  </div>
                  <div className="status-bar">
                    <div
                      className="status-bar-fill"
                      style={{
                        width: `${petState?.fatigue ?? 0}%`,
                        background: getFatigueColor(petState?.fatigue ?? 20),
                      }}
                    />
                  </div>
                </div>

                <div className="status-row">
                  <div className="status-row-label">
                    <span>💕 亲密度</span>
                    <span>{petState ? getIntimacyLabel(petState.intimacy) : ""}</span>
                  </div>
                  <div className="status-bar">
                    <div
                      className="status-bar-fill"
                      style={{
                        width: `${petState?.intimacy ?? 0}%`,
                        background: getIntimacyColor(),
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="status-tip">
                💡 多聊天可以赚金币，每10条消息奖励5金币
              </div>

              {/* 心情历史图 */}
              <MoodHistoryChart characterId={characterId} />
            </div>
          )}

          {/* 商店面板 */}
          {activeTab === "shop" && (
            <div className="sidebar-panel">
              <h3 className="panel-title">商店</h3>
              <div className="shop-list">
                {shopItems.map((item) => {
                  const canAfford = (petState?.coins ?? 0) >= item.price;
                  return (
                    <div key={item.id} className="shop-item">
                      <span className="shop-item-emoji">{item.emoji}</span>
                      <div className="shop-item-info">
                        <span className="shop-item-name">{item.name}</span>
                        <span className="shop-item-desc">{item.desc}</span>
                      </div>
                      <button
                        className="shop-item-buy"
                        disabled={busy || !canAfford}
                        onClick={() => handleBuy(item.id)}
                      >
                        {item.price}💰
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 约会面板 */}
          {activeTab === "date" && (
            <div className="sidebar-panel">
              <h3 className="panel-title">约会</h3>
              <div className="date-list">
                {dateActivities.map((act) => (
                  <div key={act.id} className="date-item">
                    <span className="date-item-emoji">{act.emoji}</span>
                    <div className="date-item-info">
                      <span className="date-item-name">{act.name}</span>
                      <span className="date-item-meta">⏱ {act.duration}</span>
                    </div>
                    <button
                      className="date-item-go"
                      disabled={busy}
                      onClick={() => handleDate(act.id)}
                    >
                      出发
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 游戏面板 */}
          {activeTab === "game" && (
            <div className="sidebar-panel">
              {/* 游戏子标签 */}
              <div className="game-sub-tabs">
                <button
                  className={`game-sub-tab${gameSubTab === "rps" ? " active" : ""}`}
                  onClick={() => setGameSubTab("rps")}
                >
                  ✊ 猜拳
                </button>
                <button
                  className={`game-sub-tab${gameSubTab === "guess" ? " active" : ""}`}
                  onClick={() => setGameSubTab("guess")}
                >
                  🔢 猜数字
                </button>
                <button
                  className={`game-sub-tab${gameSubTab === "wheel" ? " active" : ""}`}
                  onClick={() => setGameSubTab("wheel")}
                >
                  🎰 转盘
                </button>
              </div>

              {/* 猜拳游戏 */}
              {gameSubTab === "rps" && (
                <div className="game-area">
                  <p className="game-desc">赢一局 +10 金币，平局 +2 金币</p>

                  {/* 上次结果 */}
                  {gameResult && (
                    <div className={`game-result ${gameResult.result}`}>
                      <div className="game-result-hands">
                        <span className="game-hand">你: {gameResult.userEmoji}</span>
                        <span className="game-vs">VS</span>
                        <span className="game-hand">她: {gameResult.aiEmoji}</span>
                      </div>
                      <div className="game-result-text">
                        {gameResult.result === "win" && "🎉 你赢了！"}
                        {gameResult.result === "lose" && "😅 你输了～"}
                        {gameResult.result === "draw" && "🤝 平局！"}
                        {gameResult.reward ? ` +${gameResult.reward}💰` : ""}
                      </div>
                    </div>
                  )}

                  {/* 选择按钮 */}
                  <div className="game-choices">
                    <button
                      className="game-choice"
                      disabled={busy}
                      onClick={() => handleGame("rock")}
                    >
                      ✊
                      <span>石头</span>
                    </button>
                    <button
                      className="game-choice"
                      disabled={busy}
                      onClick={() => handleGame("scissors")}
                    >
                      ✌️
                      <span>剪刀</span>
                    </button>
                    <button
                      className="game-choice"
                      disabled={busy}
                      onClick={() => handleGame("paper")}
                    >
                      ✋
                      <span>布</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 猜数字游戏 */}
              {gameSubTab === "guess" && (
                <div className="game-area">
                  <p className="game-desc">猜中目标数字赢金币，剩余次数越多奖励越高</p>

                  {/* 范围选择 + 开始按钮 */}
                  {!guessGame?.finished && guessGame && (
                    <div className="guess-info">
                      <span>范围 1-{guessGame.range}</span>
                      <span>剩余 {guessGame.attemptsLeft}/{guessGame.maxAttempts} 次</span>
                    </div>
                  )}

                  {!guessGame && (
                    <>
                      <div className="guess-range-select">
                        <label className="guess-range-label">选择难度：</label>
                        <div className="guess-range-buttons">
                          <button
                            className={`guess-range-btn${guessRange === 30 ? " active" : ""}`}
                            onClick={() => setGuessRange(30)}
                          >
                            简单<br />1-30
                          </button>
                          <button
                            className={`guess-range-btn${guessRange === 50 ? " active" : ""}`}
                            onClick={() => setGuessRange(50)}
                          >
                            中等<br />1-50
                          </button>
                          <button
                            className={`guess-range-btn${guessRange === 100 ? " active" : ""}`}
                            onClick={() => setGuessRange(100)}
                          >
                            困难<br />1-100
                          </button>
                        </div>
                      </div>
                      <button
                        className="guess-start-btn"
                        disabled={busy}
                        onClick={() => handleGuessStart()}
                      >
                        开始游戏
                      </button>
                    </>
                  )}

                  {/* 游戏进行中 */}
                  {guessGame && !guessGame.finished && (
                    <div className="guess-playing">
                      {/* 历史提示 */}
                      {guessGame.hint && guessGame.lastGuess !== null && (
                        <div className={`guess-hint ${guessGame.hint}`}>
                          {guessGame.hint === "big" && `⬆️ ${guessGame.lastGuess} 猜大了`}
                          {guessGame.hint === "small" && `⬇️ ${guessGame.lastGuess} 猜小了`}
                        </div>
                      )}
                      <div className="guess-input-row">
                        <input
                          type="number"
                          className="guess-input"
                          value={guessInput}
                          onChange={(e) => setGuessInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleGuess(); }}
                          placeholder={`1-${guessGame.range}`}
                          min={1}
                          max={guessGame.range}
                          disabled={busy}
                        />
                        <button
                          className="guess-submit"
                          disabled={busy || !guessInput}
                          onClick={handleGuess}
                        >
                          猜
                        </button>
                      </div>
                      <button
                        className="guess-give-up"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("放弃这局？将无法获得奖励")) {
                            setGuessGame(null);
                            setGuessInput("");
                          }
                        }}
                      >
                        放弃重开
                      </button>
                    </div>
                  )}

                  {/* 游戏结束 */}
                  {guessGame?.finished && (
                    <div className={`guess-result ${guessGame.won ? "won" : "lost"}`}>
                      <div className="guess-result-icon">
                        {guessGame.won ? "🎉" : "😢"}
                      </div>
                      <div className="guess-result-text">
                        {guessGame.won
                          ? `猜中了！获得 ${guessGame.reward} 金币`
                          : `没猜中，下次加油！`}
                      </div>
                      <button
                        className="guess-start-btn"
                        disabled={busy}
                        onClick={() => handleGuessStart()}
                      >
                        再来一局
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 幸运转盘 */}
              {gameSubTab === "wheel" && (
                <div className="game-area">
                  <p className="game-desc">投注金币旋转转盘，中了按倍数奖励，没中扣除本金</p>

                  {/* 真实转盘 */}
                  <div className="wheel-stage">
                    {/* 指针（固定在顶部） */}
                    <div className="wheel-pointer" />
                    {/* 旋转转盘 */}
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
                            style={{ transform: `rotate(${center}deg) translateY(-70px)` }}
                          >
                            <span className="wheel-label-emoji">{seg.emoji}</span>
                            <span className="wheel-label-text">{seg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 中心圆 */}
                    <div className="wheel-center">
                      {wheelSpinning ? "🎯" : wheelResult ? wheelResult.segmentEmoji : "🎰"}
                    </div>
                  </div>

                  {/* 结果显示 */}
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

                  {/* 投注输入 */}
                  <div className="wheel-input-row">
                    <input
                      type="number"
                      className="wheel-input"
                      value={wheelBet}
                      onChange={(e) => setWheelBet(e.target.value)}
                      placeholder="投注金额"
                      min={1}
                      max={petState?.coins ?? 0}
                      disabled={busy || wheelSpinning}
                    />
                    <button
                      className="wheel-spin-btn"
                      disabled={busy || wheelSpinning}
                      onClick={handleWheel}
                    >
                      {wheelSpinning ? "旋转中..." : "旋转"}
                    </button>
                  </div>

                  {/* 快捷投注 */}
                  <div className="wheel-quick-bets">
                    <button onClick={() => setWheelBet("10")} disabled={busy}>10</button>
                    <button onClick={() => setWheelBet("50")} disabled={busy}>50</button>
                    <button onClick={() => setWheelBet("100")} disabled={busy}>100</button>
                    <button
                      onClick={() => setWheelBet(String(petState?.coins ?? 0))}
                      disabled={busy}
                    >
                      全部
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 成就面板 */}
          {activeTab === "achievement" && (
            <div className="sidebar-panel">
              <h3 className="panel-title">成就</h3>
              <AchievementsPanel
                characterId={characterId}
                refreshKey={achievementRefreshKey}
              />
            </div>
          )}

          {/* 日记面板 */}
          {activeTab === "diary" && (
            <div className="sidebar-panel">
              <h3 className="panel-title">她的日记</h3>
              <DiaryPanel
                characterId={characterId}
                refreshKey={achievementRefreshKey}
              />
            </div>
          )}
        </div>
      )}

      {/* Toast 提示 */}
      {toast && (
        <div className="sidebar-toast">
          {toast}
        </div>
      )}
    </div>
  );
}

// 标签图标
function getTabIcon(tab: Tab): string {
  switch (tab) {
    case "status": return "📊";
    case "shop": return "🛒";
    case "date": return "💕";
    case "game": return "🎮";
    case "achievement": return "🏆";
    case "diary": return "📔";
  }
}
