import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import multer from "multer";
// @ts-expect-error - node-7z 没有自带类型声明，CommonJS 模块用默认导入
import Seven from "node-7z";
import { path7za } from "7zip-bin";
import { buildPersona, PERSONALITY_TEMPLATES, clampMoodChange, getMoodLevel, SHOP_ITEMS, DATE_ACTIVITIES, DEFAULT_PET_STATE, ACHIEVEMENTS, checkAchievements } from "./persona.js";
import type { PersonaSettings, PetState } from "./persona.js";
import {
  loadCharacters,
  getCharacter,
  addCharacter,
  updateCharacter,
  deleteCharacter,
  loadConversation,
  saveConversation,
  clearConversation,
  generateId,
  DEFAULT_POSITION,
} from "./storage.js";
import type { Character } from "./storage.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// 防止浏览器缓存 API 响应（避免模型切换后前端读取到旧数据）
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  next();
});

const PORT = process.env.PORT || 3001;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// 上传的 Live2D 模型存放目录
const UPLOADS_DIR = path.join(__dirname, "../uploads/live2d");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 宠物状态数据存放目录（按角色ID独立保存）
const PET_STATE_DIR = path.join(__dirname, "../data/petstate");
if (!fs.existsSync(PET_STATE_DIR)) {
  fs.mkdirSync(PET_STATE_DIR, { recursive: true });
}

// AI 日记数据存放目录（按角色ID独立保存）
const DIARY_DIR = path.join(__dirname, "../data/diary");
if (!fs.existsSync(DIARY_DIR)) {
  fs.mkdirSync(DIARY_DIR, { recursive: true });
}

// 日记条目结构
interface DiaryEntry {
  date: string;       // YYYY-MM-DD
  content: string;    // 日记内容
  mood: number;       // 写日记时的心情
  createdAt: string;  // 创建时间 ISO
}

// 读取角色所有日记（按日期降序）
function loadDiary(characterId: string): DiaryEntry[] {
  try {
    const file = path.join(DIARY_DIR, `${characterId}.json`);
    if (!fs.existsSync(file)) return [];
    const entries: DiaryEntry[] = JSON.parse(fs.readFileSync(file, "utf-8"));
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// 保存日记列表
function saveDiary(characterId: string, entries: DiaryEntry[]): void {
  const file = path.join(DIARY_DIR, `${characterId}.json`);
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), "utf-8");
}

// 检查今天是否已有日记
function hasTodayDiary(characterId: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entries = loadDiary(characterId);
  return entries.some((e) => e.date === today);
}

// 读取指定角色的宠物状态
function loadPetState(characterId: string): PetState {
  const file = path.join(PET_STATE_DIR, `${characterId}.json`);
  try {
    if (!fs.existsSync(file)) return { ...DEFAULT_PET_STATE };
    const raw = fs.readFileSync(file, "utf-8");
    return { ...DEFAULT_PET_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PET_STATE };
  }
}

// 保存指定角色的宠物状态（updateActiveTime=true 时自动更新最后互动时间）
function savePetState(characterId: string, state: PetState, updateActiveTime: boolean = true): void {
  if (updateActiveTime) {
    state.lastActiveTime = new Date().toISOString();
  }
  const file = path.join(PET_STATE_DIR, `${characterId}.json`);
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
}

// 数值夹紧到 [min, max]
const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ========== 心情历史记录系统 ==========
const MOOD_HISTORY_DIR = path.join(__dirname, "../data/moodhistory");
if (!fs.existsSync(MOOD_HISTORY_DIR)) {
  fs.mkdirSync(MOOD_HISTORY_DIR, { recursive: true });
}
const MOOD_HISTORY_MAX_POINTS = 500; // 最多保留 500 个数据点
const MOOD_HISTORY_MAX_DAYS = 30;    // 保留最近 30 天

interface MoodPoint {
  t: number;   // 时间戳（毫秒）
  mood: number; // 心情值 0-100
}

// 记录一个心情数据点
function recordMoodPoint(characterId: string, mood: number): void {
  try {
    const file = path.join(MOOD_HISTORY_DIR, `${characterId}.json`);
    let history: MoodPoint[] = [];
    if (fs.existsSync(file)) {
      history = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
    history.push({ t: Date.now(), mood: Math.round(mood) });
    // 剪枝：只保留最近 30 天 + 最多 500 个点
    const cutoff = Date.now() - MOOD_HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000;
    history = history.filter((p) => p.t >= cutoff).slice(-MOOD_HISTORY_MAX_POINTS);
    fs.writeFileSync(file, JSON.stringify(history), "utf-8");
  } catch (e) {
    console.error("[mood-history] 记录失败:", e);
  }
}

// 读取心情历史
function loadMoodHistory(characterId: string, days: number = 7): MoodPoint[] {
  try {
    const file = path.join(MOOD_HISTORY_DIR, `${characterId}.json`);
    if (!fs.existsSync(file)) return [];
    const history: MoodPoint[] = JSON.parse(fs.readFileSync(file, "utf-8"));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return history.filter((p) => p.t >= cutoff);
  } catch {
    return [];
  }
}

// 更新心情并记录历史（统一入口）
function updateMoodWithHistory(characterId: string, newMood: number): void {
  updateCharacter(characterId, { mood: newMood });
  recordMoodPoint(characterId, newMood);
}

// 更新 PetState 的 maxCoins/maxIntimacy 并检查成就解锁
// 返回新解锁的成就 ID 列表（供调用方通知前端）
function updatePetStatsAndCheckAchievements(petState: PetState): string[] {
  // 更新历史最大值
  if (petState.coins > petState.maxCoins) petState.maxCoins = petState.coins;
  if (petState.intimacy > petState.maxIntimacy) petState.maxIntimacy = petState.intimacy;
  // 检查成就
  return checkAchievements(petState);
}

// 静态服务上传的模型文件
app.use("/api/models", express.static(UPLOADS_DIR));

// multer 配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const MAX_HISTORY_ROUNDS = 20;

interface ChatMessage {
  role: string;
  content: string;
}

// SSE 辅助函数
function sseSend(res: express.Response, data: { type: string; [key: string]: unknown }) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 解析心情和情绪标记（隐藏格式 <|mood:XX|><|emotion:标签|>，用户不可见）
function parseMarkers(buffer: string): { mood: number | null; emotion: string | null; rest: string } {
  let mood: number | null = null;
  let emotion: string | null = null;
  let rest = buffer;

  // 解析心情标记 <|mood:XX|>
  const moodMatch = rest.match(/^<\|mood:(\d{1,3})\|>/);
  if (moodMatch) {
    mood = parseInt(moodMatch[1], 10);
    rest = rest.slice(moodMatch[0].length);
  }

  // 解析情绪标记 <|emotion:XX|>
  const emotionMatch = rest.match(/^<\|emotion:(\S+?)\|>/);
  if (emotionMatch) {
    emotion = emotionMatch[1];
    rest = rest.slice(emotionMatch[0].length);
  }

  return { mood, emotion, rest };
}

function needsMoreBuffer(buffer: string): boolean {
  if (!buffer.startsWith("<")) return false;

  const firstClose = buffer.indexOf("|>");
  if (firstClose === -1) return true; // 第一个标记还没结束

  // 第一个标记完整，检查后面是否可能是第二个标记
  const afterFirst = buffer.slice(firstClose + 2);
  if (afterFirst.startsWith("<")) {
    return afterFirst.indexOf("|>") === -1; // 第二个标记还没结束
  }
  if (afterFirst === "") return true; // 刚到第一个|>后，可能后面还有标记
  return false;
}

// 从角色提取 PersonaSettings
function characterToPersona(char: Character): PersonaSettings {
  return {
    name: char.name,
    personalityTemplate: char.personalityTemplate,
    customPersonality: char.customPersonality,
  };
}

// ========== 调用 DeepSeek 流式 API 的通用函数 ==========
async function callDeepSeekStream(
  messages: ChatMessage[],
  onContent: (text: string) => void,
  onMood: (mood: number | null) => void,
  onEmotion: (emotion: string | null) => void,
  clientClosed: () => boolean
): Promise<{ fullReply: string; rawMood: number | null; emotion: string | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok || !response.body) {
    throw new Error(`DeepSeek API 调用失败 (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawBuffer = "";
  let textBuffer = "";
  let markersResolved = false;
  let rawMood: number | null = null;
  let emotion: string | null = null;
  let fullReply = "";

  const tryResolveMarkers = () => {
    if (markersResolved) return;
    if (needsMoreBuffer(textBuffer)) return;
    const { mood, emotion: emo, rest } = parseMarkers(textBuffer);
    if (mood !== null) {
      rawMood = Math.max(0, Math.min(100, mood));
    }
    emotion = emo;
    onMood(rawMood);
    onEmotion(emotion);
    markersResolved = true;
    textBuffer = rest;
    if (textBuffer) {
      fullReply += textBuffer;
      if (!clientClosed()) onContent(textBuffer);
      textBuffer = "";
    }
  };

  while (true) {
    if (clientClosed()) break;
    const { done, value } = await reader.read();
    if (done) break;

    rawBuffer += decoder.decode(value, { stream: true });
    const lines = rawBuffer.split("\n");
    rawBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.delta?.content;
        if (!content) continue;

        if (!markersResolved) {
          textBuffer += content;
          tryResolveMarkers();
        } else {
          fullReply += content;
          if (!clientClosed()) onContent(content);
        }
      } catch {
        // 忽略解析失败
      }
    }
  }

  if (!markersResolved) tryResolveMarkers();
  return { fullReply, rawMood, emotion };
}

// ========== 聊天端点（SSE 流式） ==========
app.post("/api/chat", async (req, res) => {
  const { message, characterId } = req.body as {
    message?: string;
    characterId?: string;
  };

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message 字段必填" });
  }
  if (!characterId) {
    return res.status(400).json({ error: "characterId 字段必填" });
  }
  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: "服务器未配置 DEEPSEEK_API_KEY" });
  }

  const character = getCharacter(characterId);
  if (!character) {
    return res.status(404).json({ error: "角色不存在" });
  }

  // 加载对话历史
  const convData = loadConversation(characterId);
  const currentMood = character.mood;
  const petState = loadPetState(characterId);
  const systemPrompt = buildPersona(characterToPersona(character), currentMood, petState);

  // 聊天计数 +1，每 10 条奖励 5 金币
  petState.chatCount += 1;
  petState.totalChats += 1;
  let coinReward = 0;
  if (petState.chatCount >= 10) {
    petState.chatCount = 0;
    petState.coins += 5;
    coinReward = 5;
  }
  // 每次聊天饱腹感 -1、疲劳度 +1（缓慢变化）
  petState.hunger = clampNum(petState.hunger - 1, 0, 100);
  petState.fatigue = clampNum(petState.fatigue + 1, 0, 100);
  // 检查成就解锁
  const newAchievements = updatePetStatsAndCheckAchievements(petState);
  savePetState(characterId, petState);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...convData.messages,
    { role: "user", content: message },
  ];

  // SSE 响应头
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  console.log(`[chat] characterId=${characterId}, message="${message.slice(0, 30)}"`);

  let clientClosed = false;
  res.on("close", () => { clientClosed = true; });

  const sendError = (msg: string) => {
    if (clientClosed) return;
    sseSend(res, { type: "error", error: msg });
    res.end();
  };

  try {
    const { fullReply, rawMood, emotion } = await callDeepSeekStream(
      messages,
      (text) => sseSend(res, { type: "text", text }),
      (mood) => {
        // 限制心情变化幅度
        const finalMood = mood !== null ? clampMoodChange(currentMood, mood, 5) : currentMood;
        sseSend(res, { type: "mood", mood: finalMood });
      },
      (emotion) => {
        if (emotion) sseSend(res, { type: "emotion", emotion });
      },
      () => clientClosed
    );

    const reply = fullReply.trim() || "（她好像走神了，再说一次试试～）";
    const finalMood = rawMood !== null ? clampMoodChange(currentMood, rawMood, 5) : currentMood;

    console.log(`[chat] 完成: mood=${currentMood}→${finalMood}, emotion=${emotion || "无"}, reply="${reply.slice(0, 50)}"`);

    // 保存对话历史
    convData.messages.push({ role: "user", content: message });
    convData.messages.push({ role: "assistant", content: reply });
    // 限制历史长度
    while (convData.messages.length > MAX_HISTORY_ROUNDS * 2) {
      convData.messages.shift();
    }
    convData.lastMood = finalMood;
    convData.lastActiveTime = new Date().toISOString();
    saveConversation(characterId, convData);

    // 更新角色心情
    updateMoodWithHistory(characterId, finalMood);

    if (!clientClosed) {
      // 发送宠物状态更新（前端用于刷新金币/饱腹感等）
      sseSend(res, { type: "petState", petState, coinReward, newAchievements });
      sseSend(res, { type: "done" });
      res.end();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      sendError("AI 响应超时，请稍后再试");
    } else {
      console.error("[chat] 异常:", err);
      sendError("服务器内部错误");
    }
  }
});

// ========== AI 主动发消息 ==========
app.post("/api/proactive", async (req, res) => {
  const { characterId } = req.body as { characterId?: string };

  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: "未配置 API Key" });

  const character = getCharacter(characterId);
  if (!character) return res.status(404).json({ error: "角色不存在" });

  const convData = loadConversation(characterId);
  const currentMood = character.mood;
  const petState = loadPetState(characterId);

  // 根据当前时间获取时间段
  const hour = new Date().getHours();
  let timeOfDay: string;
  if (hour < 6) timeOfDay = "现在是深夜";
  else if (hour < 11) timeOfDay = "现在是早上";
  else if (hour < 14) timeOfDay = "现在是中午";
  else if (hour < 18) timeOfDay = "现在是下午";
  else if (hour < 22) timeOfDay = "现在是晚上";
  else timeOfDay = "现在是深夜";

  // 随机选一个话题方向，避免每次主动消息重复
  // 结合玉子人设（二次元宅女/插画师/养猫/追番/抽卡），让主动消息有"她"的味道
  const proactiveTopics = [
    // 关心类
    "关心对方在做什么，语气自然不要太刻意",
    "问对方今天开不开心，有没有什么好玩的事",
    "问对方吃饭了没，像随手一发的那种",
    "提醒对方天气变化，比如降温加衣服、下雨带伞",

    // 想念/暧昧类（暧昧期人设，不好意思直说）
    "想说想对方了但又不好意思直说，绕个弯子表达",
    "抱怨对方怎么不来找你，带点小撒娇",
    "突然想听对方的声音，找个借口让他发语音或打电话",
    "看到什么东西让你想起对方，顺嘴提一下",
    "试探性地问对方在干嘛，是不是在忙",

    // 团子（橘猫）相关
    "吐槽团子刚才的捣乱行为，比如踩键盘、扒拉东西、叼走数位笔",
    "分享团子的可爱瞬间，比如睡相、表情、傻乎乎的样子",
    "说团子又在盯着空气看，不知道在干嘛，有点渗人",

    // 画画/工作相关
    "抱怨画到一半卡住了好烦，想找人说说话转移注意力",
    "分享刚交完稿的轻松感，终于解放了想庆祝一下",
    "吐槽甲方又改需求了，想打人",
    "说突然有灵感想画点什么，但不知道画啥，问他有没有想法",
    "说在给对方偷偷画一张画，不让他看",

    // 二次元相关
    "激动地分享刚更新的番太好看了，想安利给他",
    "吐槽某部番的剧情走向，比如角色死了、烂尾了、BE了",
    "说又氪金抽卡了，非到想哭或者欧到炫耀",
    "提到原神或星铁的新活动，问他玩不玩",
    "安利对方一首最近单曲循环的歌",

    // 生活琐事
    "说又熬夜了，天亮才发现，后悔但又忍不住",
    "说点了奶茶或外卖，问他要不要",
    "说被窝太暖不想起来，撒娇让他帮忙拿东西",
    "说下雨了好适合窝着不出门",
    "说刚才做了个奇怪的梦，讲给他听",
    "路过某家店想起之前的事，顺嘴提一句",

    // 共同记忆类（呼应角色档案里的记忆点）
    "提起之前约好看海的事，问他什么时候去",
    "说漫展快到了，想拉他一起去，顺便cos",
    "回忆两人之前聊过的某个话题，突然又想到了",
    "提到他一直用的那个头像（你画的），心里有点小得意",

    // 随机互动
    "突然问对方一个莫名其妙的小问题",
    "说一个小愿望，比如想去某地、想买某物、想吃某样东西",
    "想跟对方一起做某件事，比如一起看番、一起打游戏、一起点外卖",
    "分享刚才脑子里冒出来的一句莫名其妙的话",
  ];
  const topic = proactiveTopics[Math.floor(Math.random() * proactiveTopics.length)];

  // 主动消息的系统 prompt
  const systemPrompt = buildPersona(characterToPersona(character), currentMood, petState) +
    `\n\n现在是你主动找用户说话。${timeOfDay}，用户已经有一段时间没来找你了。\n你突然想聊的方向是：${topic}。\n要求：\n- 只发一条，简短自然，像微信突然弹出来的消息\n- 要符合你的性格和说话方式，带你的口头禅和语气，不要像在执行任务\n- 可以结合当前心情、时间、团子的状态自然发挥\n- 不要重复之前主动消息说过的内容，每次用不同的话题或表达方式`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...convData.messages.slice(-6), // 最近几条作为上下文
  ];

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let clientClosed = false;
  res.on("close", () => { clientClosed = true; });

  const sendError = (msg: string) => {
    if (clientClosed) return;
    sseSend(res, { type: "error", error: msg });
    res.end();
  };

  try {
    const { fullReply, rawMood, emotion } = await callDeepSeekStream(
      messages,
      (text) => sseSend(res, { type: "text", text }),
      (mood) => {
        const finalMood = mood !== null ? clampMoodChange(currentMood, mood, 5) : currentMood;
        sseSend(res, { type: "mood", mood: finalMood });
      },
      (emotion) => {
        if (emotion) sseSend(res, { type: "emotion", emotion });
      },
      () => clientClosed
    );

    const reply = fullReply.trim();
    if (reply) {
      const finalMood = rawMood !== null ? clampMoodChange(currentMood, rawMood, 5) : currentMood;
      convData.messages.push({ role: "assistant", content: reply });
      while (convData.messages.length > MAX_HISTORY_ROUNDS * 2) convData.messages.shift();
      convData.lastMood = finalMood;
      convData.lastActiveTime = new Date().toISOString();
      saveConversation(characterId, convData);
      updateMoodWithHistory(characterId, finalMood);
    }

    if (!clientClosed) {
      sseSend(res, { type: "done" });
      res.end();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      sendError("AI 响应超时");
    } else {
      console.error("[proactive] 异常:", err);
      sendError("服务器内部错误");
    }
  }
});

// ========== 心情衰减（用户长时间不回复） ==========
app.post("/api/mood-decay", (req, res) => {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });

  const character = getCharacter(characterId);
  if (!character) return res.status(404).json({ error: "角色不存在" });

  // 每次衰减 5 点
  const newMood = Math.max(0, character.mood - 5);
  updateMoodWithHistory(characterId, newMood);

  const level = getMoodLevel(newMood);
  console.log(`[mood-decay] ${character.name}: ${character.mood}→${newMood} (${level.label})`);
  res.json({ ok: true, mood: newMood, level: level.label, emoji: level.emoji });
});

// 心情历史查询（支持 days 参数，默认 7 天）
app.get("/api/mood-history", (req, res) => {
  const characterId = req.query.characterId as string | undefined;
  const days = parseInt(req.query.days as string, 10) || 7;
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  const history = loadMoodHistory(characterId, Math.min(30, Math.max(1, days)));
  res.json({ ok: true, history, days: Math.min(30, Math.max(1, days)) });
});

// 成就查询
app.get("/api/achievements", (req, res) => {
  const characterId = req.query.characterId as string | undefined;
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  const petState = loadPetState(characterId);
  const unlocked = new Set(petState.unlockedAchievements);
  // 返回所有成就 + 各档位解锁状态 + 当前进度
  const result = ACHIEVEMENTS.map((ach) => {
    const currentValue = ach.getValue(petState);
    return {
      baseId: ach.baseId,
      name: ach.name,
      desc: ach.desc,
      emoji: ach.emoji,
      category: ach.category,
      currentValue,
      tiers: ach.tiers.map((tier) => ({
        threshold: tier.threshold,
        title: tier.title,
        unlocked: unlocked.has(`${ach.baseId}_${tier.threshold}`),
      })),
    };
  });
  const totalTiers = result.reduce((sum, a) => sum + a.tiers.length, 0);
  const unlockedCount = result.reduce((sum, a) => sum + a.tiers.filter((t) => t.unlocked).length, 0);
  res.json({ ok: true, achievements: result, unlockedCount, totalTiers });
});

// ========== AI 日记系统 ==========
// 非流式调用 DeepSeek 生成日记
async function generateDiary(characterId: string): Promise<DiaryEntry | null> {
  if (!DEEPSEEK_API_KEY) return null;
  const character = getCharacter(characterId);
  if (!character) return null;

  // 今天已有日记则不重复生成
  if (hasTodayDiary(characterId)) return null;

  // 读取最近对话（取最近 20 条）
  const convData = loadConversation(characterId);
  const recentMessages = convData.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20)
    .map((m) => `${m.role === "user" ? "用户" : character.name}: ${m.content}`)
    .join("\n");

  const petState = loadPetState(characterId);
  const moodLevel = getMoodLevel(character.mood);
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const systemPrompt = `你是${character.name}，正在写自己的私人日记。请根据今天和用户的互动记录，以第一人称写一段简短的日记（150-300字）。
要求：
1. 以第一人称"我"来写，语气符合你的性格
2. 记录今天发生的事、和用户的互动、你的心情感受
3. 自然口语化，像真的在写日记，不要客套
4. 不要出现 <|mood:xx|> <|emotion:xx|> 这样的标记
5. 结尾可以有一句对明天的期待或小感慨
当前心情：${moodLevel.label}（${character.mood}/100）
当前状态：饱腹感${petState.hunger}、疲劳度${petState.fatigue}、亲密度${petState.intimacy}`;

  const userPrompt = `今天是${today}，现在${timeStr}。
以下是今天和用户的互动记录（如果没有记录，就写今天还没怎么和用户说话的感受）：
${recentMessages || "（今天还没有互动记录）"}

请写下今天的日记：`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("[diary] DeepSeek 调用失败:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const entry: DiaryEntry = {
      date: today,
      content: content.trim(),
      mood: character.mood,
      createdAt: new Date().toISOString(),
    };

    // 保存日记（最多保留 90 天）
    const entries = loadDiary(characterId);
    entries.push(entry);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = entries.filter((e) => e.date >= cutoffStr);
    saveDiary(characterId, filtered);

    console.log(`[diary] ${characterId}: 生成日记 ${today} (${content.length}字)`);
    return entry;
  } catch (e) {
    console.error("[diary] 生成失败:", e);
    return null;
  }
}

// 获取日记列表
app.get("/api/diary", (req, res) => {
  const characterId = req.query.characterId as string | undefined;
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  const entries = loadDiary(characterId);
  res.json({ ok: true, entries, hasToday: hasTodayDiary(characterId) });
});

// 生成今天的日记（每天首次打开时调用）
app.post("/api/diary/generate", async (req, res) => {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  // 今天已有日记，直接返回
  if (hasTodayDiary(characterId)) {
    const entries = loadDiary(characterId);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = entries.find((e) => e.date === today);
    return res.json({ ok: true, entry: todayEntry || null, alreadyExists: true });
  }
  // 生成新日记
  const entry = await generateDiary(characterId);
  if (!entry) {
    return res.json({ ok: false, error: "日记生成失败（可能缺少 API Key 或暂无对话记录）" });
  }
  res.json({ ok: true, entry, alreadyExists: false });
});

// ========== 角色管理 API ==========
app.get("/api/characters", (_req, res) => {
  res.json(loadCharacters());
});

app.get("/api/characters/:id", (req, res) => {
  const char = getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: "角色不存在" });
  const conv = loadConversation(req.params.id);
  // 过滤掉互动消息（以"（互动）"开头的 user 消息），它们只用于 AI 上下文，不展示给用户
  const filteredConv = {
    ...conv,
    messages: conv.messages.filter(
      (m) => !(m.role === "user" && m.content.startsWith("（互动）"))
    ),
  };
  res.json({ character: char, conversation: filteredConv });
});

app.post("/api/characters", (req, res) => {
  const { name, personalityTemplate, customPersonality, modelUrl } = req.body as Partial<Character>;
  if (!name) return res.status(400).json({ error: "name 必填" });

  const character: Character = {
    id: generateId(),
    name,
    personalityTemplate: personalityTemplate || "yuko",
    customPersonality: customPersonality || "",
    modelUrl: modelUrl || "/live2d/icegirl/IceGirl.model3.json",
    mood: 60,
    live2dPosition: { ...DEFAULT_POSITION },
    createdAt: new Date().toISOString(),
  };
  addCharacter(character);
  console.log(`[characters] 创建角色: ${character.id} (${name})`);
  res.json(character);
});

app.put("/api/characters/:id", (req, res) => {
  const updates = req.body as Partial<Character>;
  const updated = updateCharacter(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: "角色不存在" });
  console.log(`[characters] 更新角色: ${req.params.id}`);
  res.json(updated);
});

app.delete("/api/characters/:id", (req, res) => {
  const ok = deleteCharacter(req.params.id);
  if (!ok) return res.status(404).json({ error: "角色不存在" });
  console.log(`[characters] 删除角色: ${req.params.id}`);
  res.json({ ok: true });
});

// 清空对话记忆
app.delete("/api/characters/:id/conversation", (req, res) => {
  clearConversation(req.params.id);
  // 重置心情为 60
  updateCharacter(req.params.id, { mood: 60 });
  res.json({ ok: true, message: "记忆已清空" });
});

// ========== 性格模板 ==========
app.get("/api/personality-templates", (_req, res) => {
  res.json(PERSONALITY_TEMPLATES);
});

// ========== Live2D 模型管理 ==========
app.get("/api/models", (_req, res) => {
  try {
    const models: { id: string; name: string; modelUrl: string }[] = [];
    const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const modelDir = path.join(UPLOADS_DIR, entry.name);
      const files = fs.readdirSync(modelDir);
      const model3File = files.find((f) => f.endsWith(".model3.json"));
      if (model3File) {
        models.push({
          id: entry.name,
          name: entry.name,
          modelUrl: `/api/models/${entry.name}/${model3File}`,
        });
      }
    }
    res.json(models);
  } catch {
    res.json([]);
  }
});

// 删除已上传的模型
app.delete("/api/models/:id", (req, res) => {
  try {
    const modelId = req.params.id;
    // 安全检查：只允许删除 uploads 目录下的模型，防止路径遍历攻击
    if (modelId.includes("..") || modelId.includes("/") || modelId.includes("\\")) {
      return res.status(400).json({ error: "非法的模型ID" });
    }
    const modelDir = path.join(UPLOADS_DIR, modelId);
    if (!fs.existsSync(modelDir)) {
      return res.status(404).json({ error: "模型不存在" });
    }
    // 递归删除模型目录（Windows 上 fs.rmSync 可能静默失败，用 child_process 确保删除）
    try {
      fs.rmSync(modelDir, { recursive: true, force: true });
    } catch (e) {
      console.error("[delete-model] fs.rmSync 失败:", e);
    }
    // 二次检查：如果目录仍存在，用 rmdir 命令强制删除
    if (fs.existsSync(modelDir)) {
      execSync(`rmdir /s /q "${modelDir}"`, { stdio: "ignore" });
    }
    res.json({ ok: true, deleted: !fs.existsSync(modelDir) });
  } catch (err) {
    console.error("[delete-model] 删除失败:", err);
    res.status(500).json({ error: "删除模型失败" });
  }
});

// 预置模型列表（前端 public 目录中的模型）
app.get("/api/preset-models", (_req, res) => {
  const presets = [
    { id: "icegirl", name: "IceGirl", modelUrl: "/live2d/icegirl/IceGirl.model3.json", format: "cubism4" },
    { id: "haru", name: "Haru", modelUrl: "/live2d/haru/Haru.model3.json", format: "cubism4" },
  ];
  res.json(presets);
});

app.post("/api/upload-model", upload.single("model"), async (req, res) => {
  const tmpArchive = path.join(UPLOADS_DIR, `model-${Date.now()}.tmp`);
  try {
    if (!req.file) return res.status(400).json({ error: "请上传压缩文件" });

    const modelId = `model-${Date.now()}`;
    const extractDir = path.join(UPLOADS_DIR, modelId);
    fs.mkdirSync(extractDir, { recursive: true });

    // node-7z 需要文件路径，先把 buffer 写入临时文件
    fs.writeFileSync(tmpArchive, req.file.buffer);

    // 用 7-Zip 解压（支持 ZIP/RAR/7Z/TAR/GZ/BZ2/XZ 等格式）
    await new Promise<void>((resolve, reject) => {
      const stream = Seven.extractFull(tmpArchive, extractDir, {
        $bin: path7za,
        $progress: false,
      });
      stream.on("end", () => resolve());
      stream.on("error", (err: Error) => reject(err));
    });

    // 删除临时压缩文件
    fs.rmSync(tmpArchive, { force: true });

    // 查找模型文件（优先 .model3.json，其次 .model.json）
    type Found = { file: string; format: "cubism4" | "cubism2" };
    const findAll = (dir: string): Found[] => {
      const results: Found[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findAll(fullPath));
        } else if (entry.name.endsWith(".model3.json")) {
          results.push({
            file: path.relative(extractDir, fullPath).replace(/\\/g, "/"),
            format: "cubism4",
          });
        } else if (entry.name.endsWith(".model.json")) {
          results.push({
            file: path.relative(extractDir, fullPath).replace(/\\/g, "/"),
            format: "cubism2",
          });
        }
      }
      return results;
    };

    const allModels = findAll(extractDir);
    const found = allModels.find((m) => m.format === "cubism4") || allModels[0];
    if (!found) {
      fs.rmSync(extractDir, { recursive: true });
      return res.status(400).json({
        error: "压缩包中未找到 .model3.json 或 .model.json 文件",
      });
    }

    let modelFile = found.file;

    // 子目录提顶层
    const modelDir = path.dirname(path.join(extractDir, modelFile));
    if (modelDir !== extractDir) {
      const tempDir = path.join(UPLOADS_DIR, `${modelId}-tmp`);
      fs.renameSync(modelDir, tempDir);
      fs.rmSync(extractDir, { recursive: true });
      fs.renameSync(tempDir, extractDir);
      modelFile = path.basename(modelFile);
    }

    const modelUrl = `/api/models/${modelId}/${modelFile}`;
    // 优先使用用户自定义名字，否则用原始文件名
    const customName = req.body?.name as string | undefined;
    res.json({
      ok: true,
      modelId,
      modelUrl,
      name: (customName && customName.trim()) || req.file.originalname,
      format: found.format,
    });
  } catch (err) {
    console.error("模型上传失败:", err);
    fs.rmSync(tmpArchive, { force: true });
    res.status(500).json({ error: "模型上传处理失败，请检查压缩文件格式" });
  }
});

// ========== 桌宠系统 API ==========

// 获取宠物状态 + 商店 + 约会列表
app.get("/api/pet/state", (req, res) => {
  const characterId = req.query.characterId as string;
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  const petState = loadPetState(characterId);
  res.json({ petState, shopItems: SHOP_ITEMS, dateActivities: DATE_ACTIVITIES });
});

// 每日签到
app.post("/api/pet/sign", (req, res) => {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });

  const petState = loadPetState(characterId);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (petState.lastSignDate === today) {
    return res.json({ ok: false, message: "今天已经签到过了～明天再来吧！", petState });
  }

  // 签到奖励：连续签到天数越多金币越多（简单实现：固定 20 金币）
  const reward = 20;
  petState.coins += reward;
  petState.lastSignDate = today;
  petState.totalSignIns += 1;
  const newAchievements = updatePetStatsAndCheckAchievements(petState);
  savePetState(characterId, petState);

  res.json({ ok: true, message: `签到成功！获得 ${reward} 金币💰`, reward, petState, newAchievements });
});

// 购买商品
app.post("/api/pet/buy", (req, res) => {
  const { characterId, itemId } = req.body as { characterId?: string; itemId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (!itemId) return res.status(400).json({ error: "itemId 必填" });

  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "商品不存在" });

  const petState = loadPetState(characterId);
  if (petState.coins < item.price) {
    return res.json({ ok: false, message: "金币不够哦～去聊天或签到赚金币吧！", petState });
  }

  // 扣金币
  petState.coins -= item.price;
  // 应用效果
  if (item.effects.hunger) petState.hunger = clampNum(petState.hunger + item.effects.hunger, 0, 100);
  if (item.effects.fatigue) petState.fatigue = clampNum(petState.fatigue + item.effects.fatigue, 0, 100);
  if (item.effects.intimacy) petState.intimacy = clampNum(petState.intimacy + item.effects.intimacy, 0, 100);
  savePetState(characterId, petState);

  // 心情变化（通过角色 mood 体现）
  const character = getCharacter(characterId);
  let moodChange = item.effects.mood || 0;
  if (character) {
    const newMood = clampNum(character.mood + moodChange, 0, 100);
    updateMoodWithHistory(characterId, newMood);
  }

  res.json({
    ok: true,
    message: `送出了${item.emoji}${item.name}，她好开心！`,
    petState,
    moodChange,
    aiContext: `用户刚送你了一份礼物：${item.emoji}${item.name}（${item.desc}）。你要自然地表示感谢和开心，可以撒娇。`,
  });
});

// 约会活动
app.post("/api/pet/date", (req, res) => {
  const { characterId, activityId } = req.body as { characterId?: string; activityId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (!activityId) return res.status(400).json({ error: "activityId 必填" });

  const activity = DATE_ACTIVITIES.find((a) => a.id === activityId);
  if (!activity) return res.status(404).json({ error: "活动不存在" });

  const petState = loadPetState(characterId);
  // 约会不花金币，但增加疲劳
  if (petState.fatigue > 90) {
    return res.json({ ok: false, message: "她太累了，让她休息一下吧～", petState });
  }

  // 应用效果
  if (activity.effects.hunger) petState.hunger = clampNum(petState.hunger + activity.effects.hunger, 0, 100);
  if (activity.effects.fatigue) petState.fatigue = clampNum(petState.fatigue + activity.effects.fatigue, 0, 100);
  if (activity.effects.intimacy) petState.intimacy = clampNum(petState.intimacy + activity.effects.intimacy, 0, 100);
  petState.totalDates += 1;
  const newAchievements = updatePetStatsAndCheckAchievements(petState);
  savePetState(characterId, petState);

  // 心情变化
  const character = getCharacter(characterId);
  let moodChange = activity.effects.mood || 0;
  if (character) {
    const newMood = clampNum(character.mood + moodChange, 0, 100);
    updateMoodWithHistory(characterId, newMood);
  }

  res.json({
    ok: true,
    message: `一起去${activity.emoji}${activity.name}了！度过了开心的${activity.duration}`,
    petState,
    moodChange,
    newAchievements,
    aiContext: `用户刚陪你一起去${activity.emoji}${activity.name}（${activity.desc}），度过了${activity.duration}的时光。你要自然地表达这次约会的感受，很开心。`,
  });
});

// 猜拳小游戏
app.post("/api/pet/game", (req, res) => {
  const { characterId, choice } = req.body as { characterId?: string; choice?: "rock" | "scissors" | "paper" };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (!choice || !["rock", "scissors", "paper"].includes(choice)) {
    return res.status(400).json({ error: "choice 必须是 rock/scissors/paper" });
  }

  const petState = loadPetState(characterId);
  const choices: ("rock" | "scissors" | "paper")[] = ["rock", "scissors", "paper"];
  const aiChoice = choices[Math.floor(Math.random() * 3)];
  const emojiMap = { rock: "✊", scissors: "✌️", paper: "✋" };

  // 判断胜负
  let result: "win" | "lose" | "draw";
  if (choice === aiChoice) result = "draw";
  else if (
    (choice === "rock" && aiChoice === "scissors") ||
    (choice === "scissors" && aiChoice === "paper") ||
    (choice === "paper" && aiChoice === "rock")
  ) result = "win";
  else result = "lose";

  let reward = 0;
  let moodChange = 0;
  let message = "";

  if (result === "win") {
    reward = 10;
    moodChange = 5;
    petState.coins += reward;
    petState.intimacy = clampNum(petState.intimacy + 2, 0, 100);
    petState.totalGameWins += 1;
    message = `你赢了！${emojiMap[choice]} vs ${emojiMap[aiChoice]} 获得 ${reward} 金币💰`;
  } else if (result === "lose") {
    moodChange = -3;
    message = `你输了～${emojiMap[choice]} vs ${emojiMap[aiChoice]} 下次加油！`;
  } else {
    reward = 2;
    moodChange = 1;
    petState.coins += reward;
    message = `平局！${emojiMap[choice]} vs ${emojiMap[aiChoice]} 安慰奖 ${reward} 金币`;
  }

  petState.fatigue = clampNum(petState.fatigue + 3, 0, 100);
  const newAchievements = updatePetStatsAndCheckAchievements(petState);
  savePetState(characterId, petState);

  // 更新心情
  const character = getCharacter(characterId);
  if (character) {
    const newMood = clampNum(character.mood + moodChange, 0, 100);
    updateMoodWithHistory(characterId, newMood);
  }

  res.json({
    ok: true,
    result,
    aiChoice,
    aiEmoji: emojiMap[aiChoice],
    userEmoji: emojiMap[choice],
    reward,
    moodChange,
    message,
    petState,
    newAchievements,
    aiContext: `用户刚和你玩了猜拳游戏，用户出了${emojiMap[choice]}，你出了${emojiMap[aiChoice]}，${result === "win" ? "用户赢了，你要小小不服气但承认输了" : result === "lose" ? "你赢了，要得意地炫耀" : "平局，要说不分上下再来一局"}。`,
  });
});

// ========== 猜数字小游戏 ==========
// 数字范围 → 最大次数 映射
const GUESS_RANGE_CONFIG: Record<number, { maxAttempts: number; label: string }> = {
  30: { maxAttempts: 5, label: "1-30" },
  50: { maxAttempts: 6, label: "1-50" },
  100: { maxAttempts: 7, label: "1-100" },
};

// 开始猜数字游戏
app.post("/api/pet/game/guess/start", (req, res) => {
  const { characterId, range } = req.body as { characterId?: string; range?: number };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  const cfg = range && GUESS_RANGE_CONFIG[range] ? GUESS_RANGE_CONFIG[range] : GUESS_RANGE_CONFIG[30];
  const actualRange = range && GUESS_RANGE_CONFIG[range] ? range : 30;

  const petState = loadPetState(characterId);
  // 已有进行中的游戏，直接返回（不重新开始）
  if (petState.activeGuessGame && petState.activeGuessGame.attemptsLeft > 0) {
    return res.json({
      ok: true,
      range: petState.activeGuessGame.range,
      attemptsLeft: petState.activeGuessGame.attemptsLeft,
      maxAttempts: petState.activeGuessGame.maxAttempts,
      resumed: true,
      petState,
    });
  }

  const target = Math.floor(Math.random() * actualRange) + 1;
  petState.activeGuessGame = {
    target,
    attemptsLeft: cfg.maxAttempts,
    maxAttempts: cfg.maxAttempts,
    range: actualRange,
    startTime: new Date().toISOString(),
  };
  savePetState(characterId, petState);

  console.log(`[guess-start] ${characterId}: target=${target}, range=1-${actualRange}, attempts=${cfg.maxAttempts}`);

  res.json({
    ok: true,
    range: actualRange,
    attemptsLeft: cfg.maxAttempts,
    maxAttempts: cfg.maxAttempts,
    resumed: false,
    petState,
  });
});

// 猜数字
app.post("/api/pet/game/guess", (req, res) => {
  const { characterId, number } = req.body as { characterId?: string; number?: number };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (typeof number !== "number" || !Number.isFinite(number)) {
    return res.status(400).json({ error: "number 必须是数字" });
  }

  const petState = loadPetState(characterId);
  const game = petState.activeGuessGame;
  if (!game || game.attemptsLeft <= 0) {
    return res.status(400).json({ error: "没有进行中的猜数字游戏，请先开始新游戏" });
  }
  const guess = Math.floor(number);
  if (guess < 1 || guess > game.range) {
    return res.status(400).json({ error: `请猜 1-${game.range} 之间的数字` });
  }

  game.attemptsLeft -= 1;
  petState.fatigue = clampNum(petState.fatigue + 1, 0, 100);

  let hint: "correct" | "big" | "small";
  let finished = false;
  let won = false;
  let reward = 0;
  let moodChange = 0;
  let message = "";
  let aiContext = "";

  if (guess === game.target) {
    hint = "correct";
    finished = true;
    won = true;
    // 奖励 = 剩余次数 × (range / 10) 向下取整，至少 5 金币
    const baseReward = Math.max(5, Math.floor(game.attemptsLeft * (game.range / 10)));
    reward = baseReward;
    moodChange = 5;
    petState.coins += reward;
    petState.intimacy = clampNum(petState.intimacy + 1, 0, 100);
    petState.totalGuessWins += 1;
    message = `🎉 猜中了！答案就是 ${game.target}！获得 ${reward} 金币💰`;
    aiContext = `用户刚和你玩了猜数字游戏（范围1-${game.range}），用户猜中了答案${game.target}，还剩${game.attemptsLeft}次机会，获得${reward}金币。你要为用户开心、欢呼恭喜。`;
    petState.activeGuessGame = null;
  } else {
    hint = guess > game.target ? "big" : "small";
    if (game.attemptsLeft <= 0) {
      // 次数用完，游戏结束
      finished = true;
      won = false;
      moodChange = -2;
      message = `没猜中，答案其实是 ${game.target}，下次加油！`;
      aiContext = `用户刚和你玩了猜数字游戏（范围1-${game.range}），用户没在${game.maxAttempts}次机会内猜中，正确答案是${game.target}。你要安慰用户，鼓励再来一局。`;
      petState.activeGuessGame = null;
    } else {
      message = hint === "big" ? `猜大了！还剩 ${game.attemptsLeft} 次机会` : `猜小了！还剩 ${game.attemptsLeft} 次机会`;
    }
  }

  const newAchievements = updatePetStatsAndCheckAchievements(petState);
  savePetState(characterId, petState);

  // 更新心情
  if (moodChange !== 0) {
    const character = getCharacter(characterId);
    if (character) {
      const newMood = clampNum(character.mood + moodChange, 0, 100);
      updateMoodWithHistory(characterId, newMood);
    }
  }

  res.json({
    ok: true,
    hint,
    attemptsLeft: game.attemptsLeft,
    finished,
    won,
    reward,
    moodChange,
    message,
    petState,
    newAchievements,
    aiContext: aiContext || undefined,
  });
});

// ========== 幸运转盘小游戏（赌博逻辑） ==========
// 转盘扇区定义：倍数 + 概率权重 + 显示文字 + emoji
interface WheelSegment {
  multiplier: number; // 倍数（0=没中扣本金，1=保本，>1=赢）
  weight: number;     // 概率权重
  label: string;      // 显示文字
  emoji: string;      // 显示 emoji
  color: string;      // 扇区颜色
}
const WHEEL_SEGMENTS: WheelSegment[] = [
  { multiplier: 0,   weight: 45,  label: "没中",   emoji: "💔", color: "#78909c" },
  { multiplier: 1,   weight: 25,  label: "保本",   emoji: "🪙", color: "#8d6e63" },
  { multiplier: 1.5, weight: 15,  label: "×1.5",  emoji: "🥉", color: "#a1887f" },
  { multiplier: 2,   weight: 9,   label: "×2",    emoji: "🥈", color: "#90a4ae" },
  { multiplier: 3,   weight: 4,   label: "×3",    emoji: "🥇", color: "#ffd54f" },
  { multiplier: 5,   weight: 1.5, label: "×5",    emoji: "💎", color: "#4dd0e1" },
  { multiplier: 10,  weight: 0.5, label: "×10",   emoji: "👑", color: "#e91e63" },
];

// 按权重随机选择转盘扇区
function spinWheel(): WheelSegment {
  const totalWeight = WHEEL_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * totalWeight;
  for (const seg of WHEEL_SEGMENTS) {
    r -= seg.weight;
    if (r <= 0) return seg;
  }
  return WHEEL_SEGMENTS[0];
}

// 幸运转盘
app.post("/api/pet/game/wheel", (req, res) => {
  const { characterId, bet } = req.body as { characterId?: string; bet?: number };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (typeof bet !== "number" || !Number.isFinite(bet) || bet <= 0) {
    return res.status(400).json({ error: "投注金额必须大于 0" });
  }
  const betAmount = Math.floor(bet);

  const petState = loadPetState(characterId);
  if (petState.coins < betAmount) {
    return res.status(400).json({ error: `金币不足，当前只有 ${petState.coins} 金币` });
  }

  // 先扣除投注本金
  petState.coins -= betAmount;

  // 转盘
  const segment = spinWheel();
  const segmentIndex = WHEEL_SEGMENTS.indexOf(segment);
  // 返还 bet × multiplier
  const returnAmount = Math.round(betAmount * segment.multiplier);
  petState.coins += returnAmount;
  // 净变化 = returnAmount - betAmount = bet × (mult - 1)
  const netChange = returnAmount - betAmount;

  petState.fatigue = clampNum(petState.fatigue + 2, 0, 100);
  // ×10 大奖计数
  if (segment.multiplier === 10) {
    petState.totalWheelJackpots += 1;
  }
  const newAchievements = updatePetStatsAndCheckAchievements(petState);
  savePetState(characterId, petState);

  const won = segment.multiplier > 1;
  const brokeEven = segment.multiplier === 1;

  let message = "";
  let aiContext = "";
  if (segment.multiplier === 0) {
    message = `${segment.emoji} 没中！损失 ${betAmount} 金币`;
    aiContext = `用户刚和你玩了幸运转盘，投注了${betAmount}金币，结果没中，损失了${betAmount}金币。你要安慰用户，说没关系下次会中的，俏皮一点。`;
  } else if (segment.multiplier === 1) {
    message = `${segment.emoji} 保本！退回 ${betAmount} 金币`;
    aiContext = `用户刚和你玩了幸运转盘，投注了${betAmount}金币，结果保本退回本金。你要说好险差一点就没了，鼓励再来一把。`;
  } else {
    message = `${segment.emoji} 中了 ${segment.label}！获得 ${returnAmount} 金币（净赚 ${netChange}）`;
    aiContext = `用户刚和你玩了幸运转盘，投注了${betAmount}金币，中了${segment.label}倍率，获得${returnAmount}金币，净赚${netChange}金币。你要为用户欢呼恭喜，表现得兴奋一点。`;
  }

  console.log(`[wheel] ${characterId}: bet=${betAmount}, mult=${segment.multiplier}, net=${netChange}, coins=${petState.coins}`);

  res.json({
    ok: true,
    bet: betAmount,
    multiplier: segment.multiplier,
    segmentIndex,
    segmentLabel: segment.label,
    segmentEmoji: segment.emoji,
    segmentColor: segment.color,
    returnAmount,
    netChange,
    won,
    brokeEven,
    message,
    petState,
    newAchievements,
    aiContext,
  });
});

// 长时间不互动时状态衰减（饱腹感下降、疲劳度恢复、亲密度微降）
app.post("/api/pet/decay", (req, res) => {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });

  const petState = loadPetState(characterId);
  const now = Date.now();
  const last = petState.lastActiveTime ? new Date(petState.lastActiveTime).getTime() : now;
  const hoursPassed = Math.max(0, (now - last) / (1000 * 60 * 60));

  // 至少经过 1 小时才衰减
  if (hoursPassed < 1) {
    return res.json({ ok: true, petState, decayed: false });
  }

  // 每小时：饱腹感 -3、疲劳度 -5（恢复）、亲密度 -1
  const hungerLoss = Math.round(hoursPassed * 3);
  const fatigueRecovery = Math.round(hoursPassed * 5);
  const intimacyLoss = Math.round(hoursPassed * 1);

  petState.hunger = clampNum(petState.hunger - hungerLoss, 0, 100);
  petState.fatigue = clampNum(petState.fatigue - fatigueRecovery, 0, 100);
  petState.intimacy = clampNum(petState.intimacy - intimacyLoss, 0, 100);

  // 衰减后更新 lastActiveTime 为当前时间（避免重复衰减）
  savePetState(characterId, petState, false);

  console.log(`[pet-decay] ${characterId}: ${hoursPassed.toFixed(1)}h, hunger-${hungerLoss}, fatigue-${fatigueRecovery}, intimacy-${intimacyLoss}`);

  res.json({ ok: true, petState, decayed: true, hoursPassed: Math.round(hoursPassed) });
});

// 桌宠操作触发 AI 回复（不保存 user 消息，只保存 AI 回复）
app.post("/api/pet/ai-reply", async (req, res) => {
  const { characterId, context } = req.body as { characterId?: string; context?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  if (!context) return res.status(400).json({ error: "context 必填" });
  if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: "未配置 API Key" });

  const character = getCharacter(characterId);
  if (!character) return res.status(404).json({ error: "角色不存在" });

  const convData = loadConversation(characterId);
  const currentMood = character.mood;
  const petState = loadPetState(characterId);

  // 先将用户的互动动作作为 user 消息保存到历史，确保对话上下文连贯
  // 这样 AI 能区分"用户做了A→我回了A→用户做了B→我应该回B"，不会混淆
  const userActionMessage: ChatMessage = { role: "user", content: `（互动）${context}` };
  convData.messages.push(userActionMessage);
  while (convData.messages.length > MAX_HISTORY_ROUNDS * 2) convData.messages.shift();
  saveConversation(characterId, convData);

  const systemPrompt = buildPersona(characterToPersona(character), currentMood, petState) +
    `\n\n刚刚发生了一件事：${context}\n请基于这件事自然地回复一句，像微信聊天一样简短口语化，要体现你的性格和当前心情。只回一条消息。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...convData.messages.slice(-6),
  ];

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let clientClosed = false;
  res.on("close", () => { clientClosed = true; });

  const sendError = (msg: string) => {
    if (clientClosed) return;
    sseSend(res, { type: "error", error: msg });
    res.end();
  };

  try {
    const { fullReply, rawMood, emotion } = await callDeepSeekStream(
      messages,
      (text) => sseSend(res, { type: "text", text }),
      (mood) => {
        const finalMood = mood !== null ? clampMoodChange(currentMood, mood, 5) : currentMood;
        sseSend(res, { type: "mood", mood: finalMood });
      },
      (emotion) => {
        if (emotion) sseSend(res, { type: "emotion", emotion });
      },
      () => clientClosed
    );

    const reply = fullReply.trim();
    if (reply) {
      const finalMood = rawMood !== null ? clampMoodChange(currentMood, rawMood, 5) : currentMood;
      // 只保存 AI 回复，不保存 user 消息
      convData.messages.push({ role: "assistant", content: reply });
      while (convData.messages.length > MAX_HISTORY_ROUNDS * 2) convData.messages.shift();
      convData.lastMood = finalMood;
      convData.lastActiveTime = new Date().toISOString();
      saveConversation(characterId, convData);
      updateMoodWithHistory(characterId, finalMood);
    }

    if (!clientClosed) {
      sseSend(res, { type: "done" });
      res.end();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      sendError("AI 响应超时");
    } else {
      console.error("[pet/ai-reply] 异常:", err);
      sendError("服务器内部错误");
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ 后端服务已启动: http://localhost:${PORT}`);
  console.log(`   使用模型: ${MODEL}`);
});
