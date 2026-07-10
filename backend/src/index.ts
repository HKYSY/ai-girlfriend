import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
// @ts-expect-error - node-7z 没有自带类型声明，CommonJS 模块用默认导入
import Seven from "node-7z";
import { path7za } from "7zip-bin";
import { buildPersona, PERSONALITY_TEMPLATES, clampMoodChange, getMoodLevel } from "./persona.js";
import type { PersonaSettings } from "./persona.js";
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

// 解析心情和情绪标记
function parseMarkers(buffer: string): { mood: number | null; emotion: string | null; rest: string } {
  let mood: number | null = null;
  let emotion: string | null = null;
  let rest = buffer;

  // 解析心情标记
  const moodMatch = rest.match(/^【心情:(\d{1,3})】/);
  if (moodMatch) {
    mood = parseInt(moodMatch[1], 10);
    rest = rest.slice(moodMatch[0].length);
  }

  // 解析情绪标记
  const emotionMatch = rest.match(/^【情绪:(\S+?)】/);
  if (emotionMatch) {
    emotion = emotionMatch[1];
    rest = rest.slice(emotionMatch[0].length);
  }

  return { mood, emotion, rest };
}

function needsMoreBuffer(buffer: string): boolean {
  if (!buffer.startsWith("【")) return false;

  const firstClose = buffer.indexOf("】");
  if (firstClose === -1) return true; // 第一个标记还没结束

  // 第一个标记完整，检查后面是否可能是第二个标记
  const afterFirst = buffer.slice(firstClose + 1);
  if (afterFirst.startsWith("【")) {
    return afterFirst.indexOf("】") === -1; // 第二个标记还没结束
  }
  if (afterFirst === "") return true; // 刚到第一个】后，可能后面还有标记
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
  const systemPrompt = buildPersona(characterToPersona(character), currentMood);

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
    updateCharacter(characterId, { mood: finalMood });

    if (!clientClosed) {
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
  const proactiveTopics = [
    "关心对方在做什么",
    "分享自己刚才想到的一件小事",
    "撒娇说想对方了",
    "抱怨对方怎么不来找你",
    "突然问对方一个问题",
    "说一个自己的小愿望",
    "提到想吃的东西或想去的地方",
    "说刚才做了一个梦",
    "提到一首歌或一部剧",
    "问对方今天开不开心",
    "说想跟对方一起做某件事",
    "回忆两人之前的某段对话",
  ];
  const topic = proactiveTopics[Math.floor(Math.random() * proactiveTopics.length)];

  // 主动消息的系统 prompt
  const systemPrompt = buildPersona(characterToPersona(character), currentMood) +
    `\n\n现在是你主动找用户说话。${timeOfDay}，用户已经有一段时间没来找你了。\n这次你想聊的方向是：${topic}。\n主动消息要简短自然，只发一条，像微信突然弹出来的消息。\n不要重复之前说过的内容，每次用不同的话题或表达方式。`;

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
      updateCharacter(characterId, { mood: finalMood });
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
  updateCharacter(characterId, { mood: newMood });

  const level = getMoodLevel(newMood);
  console.log(`[mood-decay] ${character.name}: ${character.mood}→${newMood} (${level.label})`);
  res.json({ ok: true, mood: newMood, level: level.label, emoji: level.emoji });
});

// ========== 角色管理 API ==========
app.get("/api/characters", (_req, res) => {
  res.json(loadCharacters());
});

app.get("/api/characters/:id", (req, res) => {
  const char = getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: "角色不存在" });
  const conv = loadConversation(req.params.id);
  res.json({ character: char, conversation: conv });
});

app.post("/api/characters", (req, res) => {
  const { name, personalityTemplate, customPersonality, modelUrl } = req.body as Partial<Character>;
  if (!name) return res.status(400).json({ error: "name 必填" });

  const character: Character = {
    id: generateId(),
    name,
    personalityTemplate: personalityTemplate || "gentle",
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
    res.json({
      ok: true,
      modelId,
      modelUrl,
      name: req.file.originalname,
      format: found.format,
    });
  } catch (err) {
    console.error("模型上传失败:", err);
    fs.rmSync(tmpArchive, { force: true });
    res.status(500).json({ error: "模型上传处理失败，请检查压缩文件格式" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 后端服务已启动: http://localhost:${PORT}`);
  console.log(`   使用模型: ${MODEL}`);
});
