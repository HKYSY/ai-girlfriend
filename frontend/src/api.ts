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

// ========== SSE 流式回调 ==========
export interface StreamCallbacks {
  onMood: (mood: number) => void;
  onEmotion?: (emotion: string) => void;
  onText: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
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

export async function getPresetModels(): Promise<PresetModel[]> {
  const res = await fetch("/api/preset-models", { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function uploadModel(file: File): Promise<{
  ok: boolean;
  modelId: string;
  modelUrl: string;
  name: string;
  format?: "cubism4" | "cubism2";
}> {
  const formData = new FormData();
  formData.append("model", file);
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
