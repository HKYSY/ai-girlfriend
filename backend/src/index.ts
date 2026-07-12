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
  backupConversation,
} from "./storage.js";
import type { Character, ConversationData } from "./storage.js";
import { mergeDiaryEntries, parseMarkers } from "./utils.js";
import type { DiaryEntry } from "./utils.js";

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

// 读取角色所有日记（按日期降序）
function loadDiary(characterId: string): DiaryEntry[] {
  try {
    const file = path.join(DIARY_DIR, `${characterId}.json`);
    if (!fs.existsSync(file)) return [];
    const entries: DiaryEntry[] = JSON.parse(fs.readFileSync(file, "utf-8"));

    // 合并同一天的多条日记（去重 + 按时间拼接）
    const merged = mergeDiaryEntries(entries);
    if (merged.length < entries.length) {
      saveDiary(characterId, merged);
      console.log(`[diary] ${characterId}: 合并重复日记 ${entries.length} -> ${merged.length}`);
    }

    return merged.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });
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

const MAX_HISTORY_ROUNDS = 30; // 文件最多保留60条（30轮），配合摘要机制
const CHAT_CONTEXT_LIMIT = 30; // 发给AI的最大历史条数（最近30条）
const SUMMARY_TRIGGER = 45;    // 超过45条触发摘要生成

interface ChatMessage {
  role: string;
  content: string;
}

// SSE 辅助函数
function sseSend(res: express.Response, data: { type: string; [key: string]: unknown }) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// AI 情感分析（当 AI 没有输出心情标记时，用 AI 分析用户消息的语境情感）
// 返回 { emotion, moodChange }，分析失败返回 null
async function analyzeSentiment(message: string): Promise<{ emotion: string; moodChange: number } | null> {
  if (!DEEPSEEK_API_KEY) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `你是一个情感分析助手。分析用户发给AI女友的消息的情感倾向和情绪。
只回复JSON格式，不要其他任何内容：
{"sentiment":"正面|负面|中性","emotion":"开心|生气|难过|平静","moodChange":整数}

规则：
- 负面消息（骂人、嫌弃、冷落、说坏话、凶、讽刺、不耐烦、阴阳怪气）：moodChange为负数，越负面绝对值越大（-3到-10）
- 正面消息（夸奖、关心、哄、道歉、甜言蜜语、温柔）：moodChange为正数（3到8）
- 中性消息（正常闲聊、问问题、讨论事情）：moodChange为0或±1
- 必须理解语境和语气，不要只看字面词语。例如：
  "去你的吧谁在乎你了" → 负面/生气，moodChange约-5
  "你今天怎么这么安静" → 中性/平静，moodChange约0
  "好啦好啦是我不好" → 正面/开心(被哄)，moodChange约+4`,
          },
          {
            role: "user",
            content: `分析这条消息的情感："${message}"`,
          },
        ],
        stream: false,
        max_tokens: 100,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // 提取 JSON
    const match = content.match(/\{[^}]+\}/);
    if (!match) return null;

    const result = JSON.parse(match[0]);
    const moodChange = parseInt(result.moodChange, 10);
    if (isNaN(moodChange)) return null;

    return {
      emotion: result.emotion || "平静",
      moodChange: Math.max(-10, Math.min(10, moodChange)),
    };
  } catch (e) {
    console.error("[sentiment] AI情感分析失败:", e);
    return null;
  }
}

// 异步生成对话摘要：把旧消息压缩成摘要，保留长期记忆
async function generateSummaryIfNeeded(characterId: string): Promise<void> {
  if (!DEEPSEEK_API_KEY) return;
  const convData = loadConversation(characterId);
  if (convData.messages.length <= SUMMARY_TRIGGER) return;

  // 需要摘要的消息：前 (length - CHAT_CONTEXT_LIMIT) 条
  const toSummarize = convData.messages.slice(0, convData.messages.length - CHAT_CONTEXT_LIMIT);
  if (toSummarize.length === 0) return;

  // 构建摘要请求
  const dialogText = toSummarize
    .map((m) => `${m.role === "user" ? "用户" : "玉子"}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const oldSummary = convData.summary || "";
  const prompt = `请把以下对话记录压缩成一段简短的摘要（200字以内），保留关键信息：聊过什么话题、发生过什么重要的事、用户的喜好、约定、关系进展等。只保留重要信息，去掉闲聊细节。${oldSummary ? `\n\n之前的摘要：${oldSummary}` : ""}\n\n对话记录：\n${dialogText}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) return;

    const data = await response.json();
    const newSummary = data.choices?.[0]?.message?.content;
    if (!newSummary) return;

    // 删除已摘要的消息，保留最近 CHAT_CONTEXT_LIMIT 条
    convData.messages = convData.messages.slice(toSummarize.length);
    convData.summary = newSummary;
    convData.summaryUpTo = (convData.summaryUpTo || 0) + toSummarize.length;

    saveConversation(characterId, convData);
    console.log(`[summary] 已生成摘要: ${toSummarize.length}条消息压缩为${newSummary.length}字，剩余${convData.messages.length}条`);
  } catch (e) {
    console.error("[summary] 摘要生成失败:", e);
  }
}

function needsMoreBuffer(buffer: string): boolean {
  const trimmed = buffer.trimStart();
  if (!trimmed.startsWith("<")) return false;

  const firstClose = trimmed.indexOf("|>");
  if (firstClose === -1) return true; // 第一个标记还没结束

  // 第一个标记完整，检查后面是否可能是第二个标记
  const afterFirst = trimmed.slice(firstClose + 2);
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
    ...(convData.summary ? [{ role: "system" as const, content: `【之前的对话记忆】\n${convData.summary}` }] : []),
    ...convData.messages.slice(-CHAT_CONTEXT_LIMIT),
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
        const finalMood = mood !== null ? clampMoodChange(currentMood, mood, 10) : currentMood;
        sseSend(res, { type: "mood", mood: finalMood });
      },
      (emotion) => {
        if (emotion) sseSend(res, { type: "emotion", emotion });
      },
      () => clientClosed
    );

    const reply = fullReply.trim() || "（她好像走神了，再说一次试试～）";
    let finalMood = rawMood !== null ? clampMoodChange(currentMood, rawMood, 10) : currentMood;
    let effectiveEmotion = emotion;

    // AI 没有输出心情标记时，用 AI 情感分析用户消息的语境
    if (rawMood === null && !emotion) {
      const sentiment = await analyzeSentiment(message);
      if (sentiment) {
        effectiveEmotion = sentiment.emotion;
        finalMood = clampNum(currentMood + sentiment.moodChange, 0, 100);
        console.log(`[chat] AI情感分析: emotion=${effectiveEmotion}, moodChange=${sentiment.moodChange} (message="${message.slice(0, 20)}")`);
        if (!clientClosed) {
          sseSend(res, { type: "mood", mood: finalMood });
          sseSend(res, { type: "emotion", emotion: effectiveEmotion });
        }
      }
    }
    // 保底机制：AI 输出了情绪标记但心情没有明显变化时，强制变化
    else if ((effectiveEmotion === "生气" || effectiveEmotion === "难过") && finalMood >= currentMood - 2) {
      const forcedDecrease = 3 + Math.floor(Math.random() * 3); // 3-5
      finalMood = clampNum(currentMood - forcedDecrease, 0, 100);
      console.log(`[chat] 保底心情下降 ${forcedDecrease} (emotion=${effectiveEmotion}, rawMood=${rawMood}, currentMood=${currentMood})`);
      if (!clientClosed) sseSend(res, { type: "mood", mood: finalMood });
    }
    else if ((effectiveEmotion === "开心" || effectiveEmotion === "撒娇") && finalMood <= currentMood + 2) {
      const forcedIncrease = 2 + Math.floor(Math.random() * 3); // 2-4
      finalMood = clampNum(currentMood + forcedIncrease, 0, 100);
      console.log(`[chat] 保底心情上升 ${forcedIncrease} (emotion=${effectiveEmotion}, rawMood=${rawMood}, currentMood=${currentMood})`);
      if (!clientClosed) sseSend(res, { type: "mood", mood: finalMood });
    }

    console.log(`[chat] 完成: mood=${currentMood}→${finalMood}(raw=${rawMood}), emotion=${effectiveEmotion || "无"}, reply="${reply.slice(0, 50)}"`);

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
    backupConversation(characterId);

    // 异步生成摘要（不阻塞响应）
    generateSummaryIfNeeded(characterId).catch((e) =>
      console.error("[summary] 摘要生成失败:", e)
    );

    // 更新角色心情
    updateMoodWithHistory(characterId, finalMood);

    // 心情变化联动亲密度：被说坏话心情下降时亲密度也下降
    const moodDiff = finalMood - currentMood;
    if (moodDiff < -3) {
      // 心情明显下降，亲密度按约1/3比例下降（最多降5）
      const intimacyLoss = Math.min(5, Math.max(1, Math.round(Math.abs(moodDiff) / 3)));
      petState.intimacy = clampNum(petState.intimacy - intimacyLoss, 0, 100);
      console.log(`[chat] 亲密度下降 ${intimacyLoss} (moodDiff=${moodDiff}), intimacy=${petState.intimacy}`);
    } else if (moodDiff > 5) {
      // 心情明显上升，亲密度微增（最多增3）
      const intimacyGain = Math.min(3, Math.round(moodDiff / 5));
      petState.intimacy = clampNum(petState.intimacy + intimacyGain, 0, 100);
      // 开心能解乏：心情上升时疲劳度恢复 2-5
      const fatigueRelief = Math.min(5, Math.max(2, Math.round(moodDiff / 3)));
      petState.fatigue = clampNum(petState.fatigue - fatigueRelief, 0, 100);
      console.log(`[chat] 亲密度上升 ${intimacyGain}, 疲劳度恢复 ${fatigueRelief} (moodDiff=${moodDiff}), intimacy=${petState.intimacy}, fatigue=${petState.fatigue}`);
    }
    // 重新检查成就（亲密度变化可能触发新成就）
    const newAchFromIntimacy = updatePetStatsAndCheckAchievements(petState);
    newAchievements.push(...newAchFromIntimacy);
    savePetState(characterId, petState);

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

  // 主动消息的系统 prompt（去掉预设话题模板，让 AI 根据心情和上下文自由发挥）
  const systemPrompt = buildPersona(characterToPersona(character), currentMood, petState) +
    `\n\n现在是你主动找用户说话。${timeOfDay}，用户已经有一段时间没来找你了。\n重要前提：用户当前没有给你发消息，是你主动找用户说话，不是在回复用户。你是在自言自语、突然想找用户聊天，就像微信里主动发一条消息过去。\n要求：\n- 只发一条，简短自然，像微信突然弹出来的消息，不要像在执行任务\n- 严禁回复式表述：不要说"看到你的消息""收到你的消息""你刚说...""你跟我说...""嗯嗯我知道了""刚才你说"等任何暗示用户刚发消息或你在回复的措辞\n- 根据你当前的心情决定说什么：心情好就分享开心的事或主动撒娇，心情不好就抱怨或求关注，平静就随口聊日常\n- 话题自由发挥：可以聊你正在做的事（画画/追番/打游戏）、煤球、刚想到的事、对用户的想念、生活琐事等，不要每次都聊同一件事\n- 严禁捏造没有发生过的事：不要说"昨天我们..."如果对话记录里没有这件事；不要把想象的事当成回忆\n- 不要重复最近聊过的话题：仔细看下面的对话记录，避免聊刚刚才说过的内容\n- 要符合你的性格和说话方式，带你的口头禅和语气，QQ/微信聊天风格`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(convData.summary ? [{ role: "system" as const, content: `【之前的对话记忆】\n${convData.summary}` }] : []),
    ...convData.messages.slice(-CHAT_CONTEXT_LIMIT),
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
        const finalMood = mood !== null ? clampMoodChange(currentMood, mood, 10) : currentMood;
        sseSend(res, { type: "mood", mood: finalMood });
      },
      (emotion) => {
        if (emotion) sseSend(res, { type: "emotion", emotion });
      },
      () => clientClosed
    );

    const reply = fullReply.trim();
    if (reply) {
      const finalMood = rawMood !== null ? clampMoodChange(currentMood, rawMood, 10) : currentMood;
      convData.messages.push({ role: "assistant", content: reply });
      while (convData.messages.length > MAX_HISTORY_ROUNDS * 2) convData.messages.shift();
      convData.lastMood = finalMood;
      convData.lastActiveTime = new Date().toISOString();
      saveConversation(characterId, convData);
      backupConversation(characterId);
      generateSummaryIfNeeded(characterId).catch((e) =>
        console.error("[summary] 主动消息摘要生成失败:", e)
      );
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
// 非流式调用 DeepSeek 生成日记（一天一条，后续追加段落）
async function generateDiary(characterId: string): Promise<DiaryEntry | null> {
  if (!DEEPSEEK_API_KEY) return null;
  const character = getCharacter(characterId);
  if (!character) return null;

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

  // 检查今天是否已有日记（有则追加，无则新建）
  const entries = loadDiary(characterId);
  const todayEntry = entries.find((e) => e.date === today);
  const isAppend = !!todayEntry;

  let systemPrompt: string;
  let userPrompt: string;

  if (isAppend && todayEntry) {
    // 追加模式：只写新段落，避免重复已写内容
    systemPrompt = `你是${character.name}，正在写自己的私人日记。今天你已经在日记本上写了一些内容，现在根据之后发生的新互动，追加一段新的日记。
要求：
1. 以第一人称"我"来写，语气符合你的性格
2. 只写新发生的事和感受，不要重复已经写过的内容
3. 自然口语化，像真的在写日记
4. 不要出现 <|mood:xx|> <|emotion:xx|> 这样的标记
5. 只写一段（50-150字），不要写太长
当前心情：${moodLevel.label}（${character.mood}/100）`;

    userPrompt = `今天是${today}，现在${timeStr}。
你已经写下的日记：
---
${todayEntry.content}
---

以下是最近和用户的互动记录：
${recentMessages || "（最近没有新互动记录）"}

请追加一段新的日记（只写新内容，开头加上当前时间标记【${timeStr}】）：`;
  } else {
    // 新建模式：首篇日记
    systemPrompt = `你是${character.name}，正在写自己的私人日记。请根据今天和用户的互动记录，以第一人称写一段简短的日记（150-300字）。
要求：
1. 以第一人称"我"来写，语气符合你的性格
2. 记录今天发生的事、和用户的互动、你的心情感受
3. 自然口语化，像真的在写日记，不要客套
4. 不要出现 <|mood:xx|> <|emotion:xx|> 这样的标记
5. 结尾可以有一句对明天的期待或小感慨
6. 开头加上当前时间标记【${timeStr}】
当前心情：${moodLevel.label}（${character.mood}/100）
当前状态：饱腹感${petState.hunger}、疲劳度${petState.fatigue}、亲密度${petState.intimacy}`;

    userPrompt = `今天是${today}，现在${timeStr}。
以下是今天和用户的互动记录（如果没有记录，就写今天还没怎么和用户说话的感受）：
${recentMessages || "（今天还没有互动记录）"}

请写下今天的日记：`;
  }

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

    if (isAppend && todayEntry) {
      // 追加到已有 entry：在末尾拼接新段落
      const newContent = todayEntry.content.trimEnd() + "\n\n" + content.trim();
      const updatedEntry: DiaryEntry = {
        ...todayEntry,
        content: newContent,
        mood: character.mood, // 更新为最新心情
        createdAt: new Date().toISOString(),
      };
      const updatedEntries = entries.map((e) =>
        e.date === today ? updatedEntry : e
      );
      // 保留 90 天
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const filtered = updatedEntries.filter((e) => e.date >= cutoffStr);
      saveDiary(characterId, filtered);

      console.log(`[diary] ${characterId}: 追加日记 ${today} (+${content.length}字)`);
      return updatedEntry;
    } else {
      // 新建 entry
      const entry: DiaryEntry = {
        date: today,
        content: content.trim(),
        mood: character.mood,
        createdAt: new Date().toISOString(),
      };
      entries.push(entry);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const filtered = entries.filter((e) => e.date >= cutoffStr);
      saveDiary(characterId, filtered);

      console.log(`[diary] ${characterId}: 生成日记 ${today} (${content.length}字)`);
      return entry;
    }
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

// 生成/追加今天的日记（一天一条，后续调用追加段落）
app.post("/api/diary/generate", async (req, res) => {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: "characterId 必填" });
  const entry = await generateDiary(characterId);
  if (!entry) {
    return res.json({ ok: false, error: "日记生成失败（可能缺少 API Key 或暂无对话记录）" });
  }
  res.json({ ok: true, entry });
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
  const minutesPassed = Math.max(0, (now - last) / (1000 * 60));

  // 每 3 分钟为一档，至少经过 3 分钟才衰减
  const ticks = Math.floor(minutesPassed / 3);
  if (ticks < 1) {
    return res.json({ ok: true, petState, decayed: false });
  }

  // 每档（3分钟）：饱腹感 -1、疲劳度 -1（恢复）、亲密度 -0.5
  const hungerLoss = ticks * 1;
  const fatigueRecovery = ticks * 1;
  const intimacyLoss = Math.floor(ticks * 0.5);

  petState.hunger = clampNum(petState.hunger - hungerLoss, 0, 100);
  petState.fatigue = clampNum(petState.fatigue - fatigueRecovery, 0, 100);
  petState.intimacy = clampNum(petState.intimacy - intimacyLoss, 0, 100);

  // 衰减后更新 lastActiveTime 为当前时间（避免重复衰减）
  savePetState(characterId, petState, true);

  console.log(`[pet-decay] ${characterId}: ${minutesPassed.toFixed(0)}min(${ticks}档), hunger-${hungerLoss}, fatigue-${fatigueRecovery}, intimacy-${intimacyLoss}`);

  res.json({ ok: true, petState, decayed: true, minutesPassed: Math.round(minutesPassed) });
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
        const finalMood = mood !== null ? clampMoodChange(currentMood, mood, 10) : currentMood;
        sseSend(res, { type: "mood", mood: finalMood });
      },
      (emotion) => {
        if (emotion) sseSend(res, { type: "emotion", emotion });
      },
      () => clientClosed
    );

    const reply = fullReply.trim();
    if (reply) {
      const finalMood = rawMood !== null ? clampMoodChange(currentMood, rawMood, 10) : currentMood;
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
