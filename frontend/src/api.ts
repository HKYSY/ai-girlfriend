// 前端 API 客户端：与后端通信

export interface ChatResponse {
  reply: string;
  sessionId: string;
}

export interface PersonaSettings {
  name: string;
  personalityTemplate: string;
  customPersonality: string;
}

export interface Live2DModelInfo {
  id: string;
  name: string;
  modelUrl: string;
}

// SSE 流式回调
export interface StreamCallbacks {
  onMood: (mood: number) => void;
  onText: (text: string) => void;
  onDone: (sessionId: string) => void;
  onError: (error: string) => void;
}

// 流式发送聊天消息（SSE）
// 后端会依次推送 mood → text(多次) → done 事件
export async function streamChat(
  message: string,
  sessionId: string,
  persona: PersonaSettings | undefined,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, persona }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `请求失败 (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 按行解析 SSE 数据
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
          text?: string;
          sessionId?: string;
          error?: string;
        };
        switch (data.type) {
          case "mood":
            if (typeof data.mood === "number") callbacks.onMood(data.mood);
            break;
          case "text":
            if (data.text) callbacks.onText(data.text);
            break;
          case "done":
            callbacks.onDone(data.sessionId || sessionId);
            break;
          case "error":
            callbacks.onError(data.error || "未知错误");
            break;
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }
}

// 获取已上传的模型列表
export async function getModels(): Promise<Live2DModelInfo[]> {
  const res = await fetch("/api/models");
  if (!res.ok) return [];
  return res.json();
}

// 上传 Live2D 模型（ZIP 格式）
export async function uploadModel(file: File): Promise<{
  ok: boolean;
  modelId: string;
  modelUrl: string;
  name: string;
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
