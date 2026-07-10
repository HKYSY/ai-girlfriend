import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import AdmZip from "adm-zip";
import { buildPersona, DEFAULT_PERSONA, PERSONALITY_TEMPLATES } from "./persona.js";
import type { PersonaSettings } from "./persona.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// 上传的 Live2D 模型存放目录
const UPLOADS_DIR = path.join(__dirname, "../uploads/live2d");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 静态服务上传的模型文件（/api/models/xxx → uploads/live2d/xxx）
app.use("/api/models", express.static(UPLOADS_DIR));

// multer 配置：内存存储，文件大小限制 100MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// 上下文窗口：每个会话保留最近的对话记录
const conversations = new Map<string, { role: string; content: string }[]>();
const MAX_HISTORY_ROUNDS = 20;

interface ChatMessage {
  role: string;
  content: string;
}

function getHistory(sessionId: string): ChatMessage[] {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, []);
  }
  return conversations.get(sessionId)!;
}

function trimHistory(history: ChatMessage[]) {
  const maxMessages = MAX_HISTORY_ROUNDS * 2;
  while (history.length > maxMessages) {
    history.shift();
  }
}

// SSE 事件推送辅助函数
function sseSend(
  res: express.Response,
  data: { type: string; [key: string]: unknown }
) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 解析 AI 回复开头的【心情:XX】标记
// 返回 { mood, text } —— mood 为解析到的心情值，text 为去掉标记后的剩余文本
function parseMoodMarker(buffer: string): {
  mood: number | null;
  rest: string;
} {
  const match = buffer.match(/^【心情:(\d{1,3})】/);
  if (match) {
    const mood = parseInt(match[1], 10);
    return { mood, rest: buffer.slice(match[0].length) };
  }
  return { mood: null, rest: buffer };
}

// 判断缓冲区是否还需要继续等待心情标记
function needsMoreBuffer(buffer: string): boolean {
  const prefix = "【心情:";
  // 不是以【开头，肯定没有心情标记
  if (!buffer.startsWith("【")) return false;
  // 以【心情:开头但还没遇到】，继续等
  if (buffer.startsWith(prefix)) {
    return !buffer.includes("】");
  }
  // buffer 是 "【心情:" 的前缀（如 "【"、"【心"、"【心情"），继续等
  if (prefix.startsWith(buffer)) return true;
  // 以【开头但不是心情标记前缀（如 "【其他"），不需要等
  return false;
}

app.post("/api/chat", async (req, res) => {
  const {
    message,
    sessionId = "default",
    persona,
  } = req.body as {
    message?: string;
    sessionId?: string;
    persona?: PersonaSettings;
  };

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message 字段必填" });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: "服务器未配置 DEEPSEEK_API_KEY" });
  }

  const history = getHistory(sessionId);

  // 根据前端传来的人设设置生成 system prompt
  const personaSettings: PersonaSettings = persona
    ? {
        name: persona.name || DEFAULT_PERSONA.name,
        personalityTemplate: persona.personalityTemplate || "gentle",
        customPersonality: persona.customPersonality || "",
      }
    : DEFAULT_PERSONA;
  const systemPrompt = buildPersona(personaSettings);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 Nginx 缓冲（若有反代）
  res.flushHeaders();

  console.log(`[chat] 收到请求: sessionId=${sessionId}, message="${message.slice(0, 30)}"`);

  // 客户端断开时标记 —— 必须监听 res 的 close 事件
  // （req 的 close 在 express.json() 解析完 body 后就会触发，不能用来判断客户端是否断开）
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
    console.log("[chat] 客户端断开连接");
  });

  // 推送错误并结束
  const sendError = (msg: string) => {
    if (clientClosed) return;
    sseSend(res, { type: "error", error: msg });
    res.end();
  };

  try {
    console.log("[chat] 正在调用 DeepSeek API...");
    // 超时保护：120 秒后中断 fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log("[chat] DeepSeek API 响应状态:", response.status);

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      console.error("[chat] DeepSeek API 错误:", response.status, errText);
      return sendError(`DeepSeek API 调用失败 (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let rawBuffer = ""; // 用于按行解析 DeepSeek SSE
    let textBuffer = ""; // 用于缓冲开头解析心情标记
    let moodResolved = false;
    let moodValue = 60; // 默认心情值
    let fullReply = ""; // 完整回复文本（不含心情标记）
    let chunkCount = 0;

    // 尝试解析缓冲区开头的心情标记
    const tryResolveMood = () => {
      if (moodResolved) return;
      if (needsMoreBuffer(textBuffer)) return; // 还需要更多字符
      const { mood, rest } = parseMoodMarker(textBuffer);
      if (mood !== null) {
        moodValue = Math.max(0, Math.min(100, mood));
      }
      // 无论是否解析到标记，都推送当前心情值（解析到用真实值，否则用默认值60）
      if (!clientClosed) sseSend(res, { type: "mood", mood: moodValue });
      moodResolved = true;
      console.log("[chat] 心情值已解析:", moodValue);
      textBuffer = rest;
      // 把剩余缓冲的文本推送出去
      if (textBuffer) {
        fullReply += textBuffer;
        if (!clientClosed) sseSend(res, { type: "text", text: textBuffer });
        textBuffer = "";
      }
    };

    while (true) {
      if (clientClosed) break;
      const { done, value } = await reader.read();
      if (done) break;

      chunkCount++;
      rawBuffer += decoder.decode(value, { stream: true });

      // 按行解析 DeepSeek 的 SSE 数据
      const lines = rawBuffer.split("\n");
      rawBuffer = lines.pop() || ""; // 保留最后不完整的一行

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
          if (!content) continue; // 跳过推理内容（reasoning_content），只转发实际回复

          if (!moodResolved) {
            textBuffer += content;
            tryResolveMood();
          } else {
            fullReply += content;
            if (!clientClosed) sseSend(res, { type: "text", text: content });
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    // 流结束后，若心情标记还没解析（例如 AI 没按格式输出），处理剩余缓冲
    if (!moodResolved) {
      tryResolveMood();
    }

    const reply =
      fullReply.trim() || "（她好像走神了，再说一次试试～）";

    console.log(`[chat] 完成: mood=${moodValue}, reply="${reply.slice(0, 50)}"`);

    // 保存到历史记录（纯文本，不含心情标记）
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    trimHistory(history);

    if (!clientClosed) {
      sseSend(res, { type: "done", sessionId });
      res.end();
      console.log("[chat] 已发送 done 事件并关闭响应");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[chat] DeepSeek API 调用超时（120秒）");
      sendError("AI 响应超时，请稍后再试");
    } else {
      console.error("[chat] 服务器异常:", err);
      sendError("服务器内部错误");
    }
  }
});

// 清空某会话记忆
app.delete("/api/chat/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  conversations.delete(sessionId);
  res.json({ ok: true, message: "记忆已清空" });
});

// 获取性格模板列表
app.get("/api/personality-templates", (_req, res) => {
  res.json(PERSONALITY_TEMPLATES);
});

// 获取已上传的模型列表
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

// 上传 Live2D 模型（ZIP 格式）
app.post(
  "/api/upload-model",
  upload.single("model"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "请上传 ZIP 文件" });
      }

      const zip = new AdmZip(req.file.buffer);
      const modelId = `model-${Date.now()}`;
      const extractDir = path.join(UPLOADS_DIR, modelId);
      fs.mkdirSync(extractDir, { recursive: true });

      zip.extractAllTo(extractDir, true);

      // 查找 .model3.json 文件（可能在子目录中）
      let model3File: string | null = null;
      const findModel3 = (dir: string): string | null => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findModel3(fullPath);
            if (found) return found;
          } else if (entry.name.endsWith(".model3.json")) {
            return path.relative(extractDir, fullPath).replace(/\\/g, "/");
          }
        }
        return null;
      };

      model3File = findModel3(extractDir);
      if (!model3File) {
        fs.rmSync(extractDir, { recursive: true });
        return res.status(400).json({ error: "ZIP 中未找到 .model3.json 文件" });
      }

      // 如果 model3.json 在子目录中，把子目录内容提到顶层
      const model3Dir = path.dirname(path.join(extractDir, model3File));
      if (model3Dir !== extractDir) {
        const tempDir = path.join(UPLOADS_DIR, `${modelId}-tmp`);
        fs.renameSync(model3Dir, tempDir);
        fs.rmSync(extractDir, { recursive: true });
        fs.renameSync(tempDir, extractDir);
        model3File = path.basename(model3File);
      }

      const modelUrl = `/api/models/${modelId}/${model3File}`;
      res.json({ ok: true, modelId, modelUrl, name: req.file.originalname });
    } catch (err) {
      console.error("模型上传失败:", err);
      res.status(500).json({ error: "模型上传处理失败" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`✅ 后端服务已启动: http://localhost:${PORT}`);
  console.log(`   使用模型: ${MODEL}`);
});
