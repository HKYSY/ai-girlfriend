// 前端 API 客户端：与后端通信

// ========== 类型定义 ==========
export interface PersonaSettings {
  name: string;
  personalityTemplate: string;
  customPersonality: string;
}

export interface Character {
  id: string;
  name: string;
  personalityTemplate: string;
  customPersonality: string;
  modelUrl: string;
  mood: number;
  live2dPosition: { x: number; y: number; scale: number };
  createdAt: string;
  apiProvider?: string;
  apiKey?: string;
  apiModel?: string;
  apiUrl?: string;
  avatarUrl?: string;
}

export interface ConversationData {
  messages: { role: string; content: string }[];
  lastMood: number;
  lastActiveTime: string;
}

export interface Live2DModelInfo {
  id: string;
  name: string;
  modelUrl: string;
}

export interface PresetModel {
  id: string;
  name: string;
  modelUrl: string;
  format: "cubism2" | "cubism4";
}

export interface MoodLevelInfo {
  level: number;
  label: string;
  emoji: string;
  color: string;
}

// ========== 桌宠系统类型 ==========
// 进行中的猜数字游戏状态
export interface GuessGameState {
  target: number;
  attemptsLeft: number;
  maxAttempts: number;
  range: number;
  startTime: string;
}

export interface PetState {
  coins: number;
  hunger: number;
  fatigue: number;
  intimacy: number;
  lastSignDate: string;
  chatCount: number;
  lastActiveTime?: string; // 上次互动时间 ISO 字符串
  activeGuessGame?: GuessGameState | null; // 进行中的猜数字游戏
  // 成就统计字段
  totalChats?: number;
  totalSignIns?: number;
  totalDates?: number;
  totalGameWins?: number;
  totalGuessWins?: number;
  totalWheelJackpots?: number;
  maxIntimacy?: number;
  maxCoins?: number;
  unlockedAchievements?: string[];
}

export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  effects: { hunger?: number; fatigue?: number; mood?: number; intimacy?: number };
  category: "food" | "drink" | "gift" | "medicine";
}

export interface DateActivity {
  id: string;
  name: string;
  emoji: string;
  duration: string;
  desc: string;
  effects: { hunger?: number; fatigue?: number; mood?: number; intimacy?: number };
}

export interface PetStateResponse {
  petState: PetState;
  shopItems: ShopItem[];
  dateActivities: DateActivity[];
}

export interface PetActionResult {
  ok: boolean;
  message: string;
  petState: PetState;
  moodChange?: number;
  reward?: number;
  aiContext?: string;
  // 猜拳游戏专属
  result?: "win" | "lose" | "draw";
  aiChoice?: "rock" | "scissors" | "paper";
  aiEmoji?: string;
  userEmoji?: string;
  // 猜数字游戏专属
  hint?: "correct" | "big" | "small";
  attemptsLeft?: number;
  finished?: boolean;
  won?: boolean;
  // 幸运转盘专属
  bet?: number;
  multiplier?: number;
  segmentIndex?: number;
  segmentLabel?: string;
  segmentEmoji?: string;
  segmentColor?: string;
  returnAmount?: number;
  netChange?: number;
  brokeEven?: boolean;
  // 新解锁的成就 ID 列表
  newAchievements?: string[];
}

// ========== SSE 流式回调 ==========
export interface StreamCallbacks {
  onMood: (mood: number) => void;
  onEmotion?: (emotion: string) => void;
  onText: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onPetState?: (petState: PetState, coinReward?: number) => void;
  onSticker?: (sticker: { id: number; url: string; category: string }) => void;
}

// ========== 通用 SSE 消费函数 ==========
async function consumeSSE(
  res: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `请求失败 (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;

      try {
        const data = JSON.parse(payload) as {
          type: string;
          mood?: number;
          emotion?: string;
          text?: string;
          error?: string;
          petState?: PetState;
          coinReward?: number;
          sticker?: { id: number; url: string; category: string };
        };
        switch (data.type) {
          case "mood":
            if (typeof data.mood === "number") callbacks.onMood(data.mood);
            break;
          case "emotion":
            if (data.emotion && callbacks.onEmotion) callbacks.onEmotion(data.emotion);
            break;
          case "text":
            if (data.text) callbacks.onText(data.text);
            break;
          case "sticker":
            if (data.sticker && callbacks.onSticker) callbacks.onSticker(data.sticker);
            break;
          case "petState":
            if (data.petState && callbacks.onPetState) callbacks.onPetState(data.petState, data.coinReward);
            break;
          case "done":
            callbacks.onDone();
            break;
          case "error":
            callbacks.onError(data.error || "未知错误");
            break;
        }
      } catch {
        // 忽略解析失败
      }
    }
  }
}

// ========== 聊天（SSE 流式） ==========
export async function streamChat(
  message: string,
  characterId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, characterId }),
  });
  await consumeSSE(res, callbacks);
}

// ========== AI 主动发消息（SSE 流式） ==========
export async function streamProactive(
  characterId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/proactive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  await consumeSSE(res, callbacks);
}

// ========== 心情衰减 ==========
export async function moodDecay(characterId: string): Promise<{
  mood: number;
  level: string;
  emoji: string;
}> {
  const res = await fetch("/api/mood-decay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error("心情衰减失败");
  return res.json();
}

// ========== 角色管理 ==========
export async function getCharacters(): Promise<Character[]> {
  const res = await fetch("/api/characters", { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function getCharacterDetail(id: string): Promise<{
  character: Character;
  conversation: ConversationData;
}> {
  const res = await fetch(`/api/characters/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("角色不存在");
  return res.json();
}

export async function createCharacter(data: {
  name: string;
  personalityTemplate: string;
  customPersonality: string;
  modelUrl: string;
}): Promise<Character> {
  const res = await fetch("/api/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("创建角色失败");
  return res.json();
}

export async function updateCharacter(
  id: string,
  updates: Partial<Character>
): Promise<Character> {
  const res = await fetch(`/api/characters/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("更新角色失败");
  return res.json();
}

export async function deleteCharacter(id: string): Promise<void> {
  await fetch(`/api/characters/${id}`, { method: "DELETE" });
}

export async function clearConversation(id: string): Promise<void> {
  await fetch(`/api/characters/${id}/conversation`, { method: "DELETE" });
}

// ========== 性格模板 ==========
export async function getPersonalityTemplates(): Promise<Record<string, string>> {
  const res = await fetch("/api/personality-templates");
  if (!res.ok) return {};
  return res.json();
}

// ========== Live2D 模型管理 ==========
export async function getModels(): Promise<Live2DModelInfo[]> {
  const res = await fetch("/api/models", { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteModel(modelId: string): Promise<void> {
  const res = await fetch(`/api/models/${modelId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `删除失败 (${res.status})`);
  }
}

export async function getPresetModels(): Promise<PresetModel[]> {
  const res = await fetch("/api/preset-models", { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function uploadModel(file: File, customName?: string): Promise<{
  ok: boolean;
  modelId: string;
  modelUrl: string;
  name: string;
  format?: "cubism4" | "cubism2";
}> {
  const formData = new FormData();
  formData.append("model", file);
  if (customName && customName.trim()) {
    formData.append("name", customName.trim());
  }
  const res = await fetch("/api/upload-model", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `上传失败 (${res.status})`);
  }
  return res.json();
}

// ========== 心情等级映射（前端用） ==========
export const MOOD_LEVELS: MoodLevelInfo[] = [
  { level: 0, label: "极度失落", emoji: "😭", color: "#5c6bc0" },
  { level: 1, label: "很难过", emoji: "😢", color: "#7986cb" },
  { level: 2, label: "难过", emoji: "😔", color: "#9575cd" },
  { level: 3, label: "有点不开心", emoji: "😟", color: "#ab47bc" },
  { level: 4, label: "略微低落", emoji: "🙁", color: "#ba68c8" },
  { level: 5, label: "平静", emoji: "😌", color: "#66bb6a" },
  { level: 6, label: "舒适", emoji: "🙂", color: "#9ccc65" },
  { level: 7, label: "开心", emoji: "😊", color: "#ff7043" },
  { level: 8, label: "很开心", emoji: "😄", color: "#ff5722" },
  { level: 9, label: "非常开心", emoji: "😍", color: "#e91e63" },
];

export function getMoodLevelInfo(mood: number): MoodLevelInfo {
  const level = Math.floor(Math.max(0, Math.min(100, mood)) / 10);
  return MOOD_LEVELS[Math.min(9, level)];
}

// ========== 桌宠系统 API ==========
export async function getPetState(characterId: string): Promise<PetStateResponse> {
  const res = await fetch(`/api/pet/state?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取宠物状态失败");
  return res.json();
}

export async function petSign(characterId: string): Promise<PetActionResult> {
  const res = await fetch("/api/pet/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error("签到失败");
  return res.json();
}

export async function petBuy(characterId: string, itemId: string): Promise<PetActionResult> {
  const res = await fetch("/api/pet/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, itemId }),
  });
  if (!res.ok) throw new Error("购买失败");
  return res.json();
}

export async function petDate(characterId: string, activityId: string): Promise<PetActionResult> {
  const res = await fetch("/api/pet/date", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, activityId }),
  });
  if (!res.ok) throw new Error("约会失败");
  return res.json();
}

export async function petGame(characterId: string, choice: "rock" | "scissors" | "paper"): Promise<PetActionResult> {
  const res = await fetch("/api/pet/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, choice }),
  });
  if (!res.ok) throw new Error("游戏失败");
  return res.json();
}

// 猜数字：开始新游戏
export async function petGuessStart(characterId: string, range: number): Promise<{
  ok: boolean;
  range: number;
  attemptsLeft: number;
  maxAttempts: number;
  resumed: boolean;
  petState: PetState;
}> {
  const res = await fetch("/api/pet/game/guess/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, range }),
  });
  if (!res.ok) throw new Error("开始猜数字失败");
  return res.json();
}

// 猜数字：提交猜测
export async function petGuess(characterId: string, number: number): Promise<PetActionResult> {
  const res = await fetch("/api/pet/game/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, number }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "猜数字失败");
  }
  return res.json();
}

// 幸运转盘：投注并旋转
export async function petWheel(characterId: string, bet: number): Promise<PetActionResult> {
  const res = await fetch("/api/pet/game/wheel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, bet }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "幸运转盘失败");
  }
  return res.json();
}

// 桌宠操作触发 AI 回复（SSE 流式）
export async function streamPetAIReply(
  characterId: string,
  context: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/pet/ai-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, context }),
  });
  await consumeSSE(res, callbacks);
}

// 长时间不互动状态衰减（饱腹感下降、疲劳度恢复、亲密度微降）
export async function petDecay(characterId: string): Promise<{
  ok: boolean;
  petState: PetState;
  decayed: boolean;
  minutesPassed?: number;
}> {
  const res = await fetch("/api/pet/decay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error("状态衰减失败");
  return res.json();
}

// 心情历史数据点
export interface MoodPoint {
  t: number;   // 时间戳（毫秒）
  mood: number; // 心情值 0-100
}

// ========== 每日首次问候 ==========
export async function dailyGreeting(characterId: string): Promise<{
  ok: boolean;
  triggered: boolean;
  reason?: string;
}> {
  const res = await fetch("/api/daily-greeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error("每日问候请求失败");
  // 如果是JSON响应（未触发），直接返回
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  // SSE响应（已触发），返回triggered=true让前端用consumeSSE处理
  return { ok: true, triggered: true };
}

// ========== 每日首次问候（SSE流式） ==========
export async function streamDailyGreeting(
  characterId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/daily-greeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    // 未触发，直接解析JSON
    const data = await res.json();
    if (!data.triggered) {
      callbacks.onDone();
      return;
    }
  }
  await consumeSSE(res, callbacks);
}

// 获取心情历史
export async function getMoodHistory(characterId: string, days: number = 7): Promise<{
  ok: boolean;
  history: MoodPoint[];
  days: number;
}> {
  const res = await fetch(`/api/mood-history?characterId=${encodeURIComponent(characterId)}&days=${days}`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取心情历史失败");
  return res.json();
}

// ========== 成就系统 ==========
export interface AchievementTierInfo {
  threshold: number;
  title: string;
  unlocked: boolean;
}

export interface AchievementInfo {
  baseId: string;
  name: string;
  desc: string;
  emoji: string;
  category: "chat" | "sign" | "date" | "game" | "coin" | "intimacy";
  currentValue: number;
  tiers: AchievementTierInfo[];
}

// 获取成就列表
export async function getAchievements(characterId: string): Promise<{
  ok: boolean;
  achievements: AchievementInfo[];
  unlockedCount: number;
  totalTiers: number;
}> {
  const res = await fetch(`/api/achievements?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取成就失败");
  return res.json();
}

// ========== AI 日记系统 ==========
export interface DiaryEntry {
  date: string;       // YYYY-MM-DD
  content: string;
  mood: number;
  createdAt: string;
}

// ========== 消息分页查询（数据库版）==========
export async function getMessages(
  characterId: string,
  beforeId?: number,
  limit: number = 50
): Promise<{
  ok: boolean;
  messages: Array<{ id: number; characterId: string; role: string; content: string; createdAt: string }>;
  total: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams({ characterId, limit: String(limit) });
  if (beforeId && beforeId > 0) params.set("beforeId", String(beforeId));
  const res = await fetch(`/api/messages?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取消息失败");
  return res.json();
}

// ========== 消息全文搜索 ==========
export async function searchMessages(characterId: string, query: string): Promise<{
  ok: boolean;
  results: Array<{ id: number; characterId: string; role: string; content: string; createdAt: string }>;
  query: string;
}> {
  const res = await fetch(`/api/messages/search?characterId=${encodeURIComponent(characterId)}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("搜索失败");
  return res.json();
}

// ========== 事实记忆 ==========
export interface MemoryFact {
  id: number;
  characterId: string;
  fact: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export async function getFacts(characterId: string): Promise<{ ok: boolean; facts: MemoryFact[]; count: number }> {
  const res = await fetch(`/api/facts?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取事实失败");
  return res.json();
}

export async function extractFacts(characterId: string): Promise<{ ok: boolean; extracted: number }> {
  const res = await fetch("/api/facts/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error("事实提取失败");
  return res.json();
}
export async function getDiary(characterId: string): Promise<{
  ok: boolean;
  entries: DiaryEntry[];
  hasToday: boolean;
}> {
  const res = await fetch(`/api/diary?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取日记失败");
  return res.json();
}

// 生成日记（默认生成昨天的）
export async function generateDiary(characterId: string, date?: string): Promise<{
  ok: boolean;
  entry: DiaryEntry | null;
  alreadyExists: boolean;
  error?: string;
}> {
  const res = await fetch("/api/diary/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, date }),
  });
  if (!res.ok) throw new Error("生成日记失败");
  return res.json();
}

// 补生成最近 N 天缺失的日记（已有日记或无对话的日期自动跳过）
export async function backfillDiaries(characterId: string, days: number = 7): Promise<{
  ok: boolean;
  generated: string[];
  checked: number;
}> {
  const res = await fetch("/api/diary/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, days }),
  });
  if (!res.ok) throw new Error("补生成日记失败");
  return res.json();
}

// ========== 全局统计（所有角色数据总览） ==========
export interface CharacterStat {
  id: string;
  name: string;
  mood: number;
  msgCount: number;
  daysAgo: number;
  lastActiveTime: string;
  modelUrl: string;
}

export async function getStats(): Promise<{
  ok: boolean;
  stats: CharacterStat[];
  totalMessages: number;
  totalCharacters: number;
  totalDays: number;
}> {
  const res = await fetch("/api/stats", { cache: "no-store" });
  if (!res.ok) throw new Error("获取统计失败");
  return res.json();
}

// 导出某角色的全部对话记录（返回 JSON Blob 供下载）
export async function exportConversation(characterId: string): Promise<Blob> {
  const res = await fetch(`/api/characters/${characterId}/export`, { cache: "no-store" });
  if (!res.ok) throw new Error("导出失败");
  return res.blob();
}

// ========== 连接测试 ==========
export async function testConnection(config: {
  provider: string;
  apiKey: string;
  apiModel: string;
  apiUrl: string;
}): Promise<{ ok: boolean; latency?: number; model?: string; error?: string }> {
  const res = await fetch("/api/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("测试请求失败");
  return res.json();
}

// ========== 头像上传 ==========
export async function uploadAvatar(file: File): Promise<{ ok: boolean; url: string }> {
  const formData = new FormData();
  formData.append("avatar", file);
  const res = await fetch("/api/upload-avatar", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `上传失败 (${res.status})`);
  }
  return res.json();
}

// ========== 表情包系统 ==========
export interface Sticker {
  id: number;
  filename: string;
  category: string;
  keywords: string;
  emotionMatch: string;
  usageCount: number;
  createdAt: string;
}

// 获取表情包列表
export async function getStickers(category?: string): Promise<{ ok: boolean; stickers: Sticker[] }> {
  const url = category ? `/api/stickers/category/${category}` : "/api/stickers";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("获取表情包失败");
  return res.json();
}

// 用户发送表情包（保存到消息记录）
export async function sendStickerMessage(
  characterId: string,
  stickerId: number
): Promise<{ ok: boolean; messageId: number }> {
  const res = await fetch("/api/send-sticker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, stickerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "发送表情包失败");
  }
  return res.json();
}

// 发送表情包并触发 AI 回复（SSE 流式，与 streamChat 类似）
export async function streamSticker(
  characterId: string,
  stickerId: number,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/send-sticker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, stickerId }),
  });
  // 与 streamChat 共用同一个 SSE 消费函数
  return consumeSSE(res, callbacks);
}

// 扫描 stickers/temp 目录，批量导入用户手动放入的图片
export async function scanImportStickers(): Promise<{
  ok: boolean;
  imported: number;
  skipped: number;
  errors?: string[];
  total: number;
  message?: string;
}> {
  const res = await fetch("/api/stickers/scan-import", { method: "POST" });
  if (!res.ok) throw new Error("扫描导入失败");
  return res.json();
}

// 标注表情包（更新分类 / 情绪匹配，供手动标注用）
export async function updateSticker(
  id: number,
  fields: { category?: string; emotionMatch?: string }
): Promise<{ ok: boolean; sticker?: Sticker }> {
  const res = await fetch(`/api/stickers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error("标注失败");
  return res.json();
}

// 获取最近使用过的表情包（QQ 风格"最近"区域用）
export async function getRecentStickers(): Promise<{ ok: boolean; stickers: Sticker[] }> {
  const res = await fetch("/api/stickers/recent", { cache: "no-store" });
  if (!res.ok) throw new Error("获取最近表情包失败");
  return res.json();
}
