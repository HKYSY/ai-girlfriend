// 数据存储层 —— 已迁移为 SQLite 数据库
// 保留原接口兼容，内部全部走 database.ts

import { dbCharacters, dbMessages, dbConvMeta } from "./database.js";
import type { DBCharacter, DBMessage } from "./database.js";

// ========== 类型（与前端兼容）==========
export interface Character {
  id: string;
  name: string;
  personalityTemplate: string;
  customPersonality: string;
  modelUrl: string;
  mood: number;
  live2dPosition: { x: number; y: number; scale: number };
  createdAt: string;
  apiProvider: string;
  apiKey: string;
  apiModel: string;
  apiUrl: string;
  avatarUrl?: string;
}

export interface ConversationData {
  messages: { role: string; content: string }[];
  lastMood: number;
  lastActiveTime: string;
  summary?: string;
  summaryUpTo?: number;
}

export const DEFAULT_POSITION = { x: 0, y: 0, scale: 1 };

// ========== 转换函数 ==========
function toCharacter(db: DBCharacter): Character {
  return {
    id: db.id,
    name: db.name,
    personalityTemplate: db.personalityTemplate,
    customPersonality: db.customPersonality,
    modelUrl: db.modelUrl,
    mood: db.mood,
    live2dPosition: { x: db.positionX, y: db.positionY, scale: db.positionScale },
    createdAt: db.createdAt,
    apiProvider: db.apiProvider || "deepseek",
    apiKey: db.apiKey || "",
    apiModel: db.apiModel || "",
    apiUrl: db.apiUrl || "",
    avatarUrl: db.avatarUrl || "",
  };
}

function dbToCharRow(c: Character) {
  return {
    id: c.id, name: c.name,
    personalityTemplate: c.personalityTemplate, customPersonality: c.customPersonality,
    modelUrl: c.modelUrl, mood: c.mood,
    positionX: c.live2dPosition.x, positionY: c.live2dPosition.y, positionScale: c.live2dPosition.scale,
    createdAt: c.createdAt, updatedAt: null as string | null,
    apiProvider: c.apiProvider || "deepseek",
    apiKey: c.apiKey || "",
    apiModel: c.apiModel || "",
    apiUrl: c.apiUrl || "",
    avatarUrl: c.avatarUrl || "",
  } satisfies DBCharacter;
}

// ========== 角色管理 ==========
export function loadCharacters(): Character[] {
  return dbCharacters.getAll().map(toCharacter);
}

export function saveCharacters(_characters: Character[]): void {
  // 数据库模式下不再需要批量保存，各操作直接写库
}

export function getCharacter(id: string): Character | undefined {
  const db = dbCharacters.getById(id);
  return db ? toCharacter(db) : undefined;
}

export function addCharacter(character: Character): void {
  dbCharacters.add(dbToCharRow(character));
}

export function updateCharacter(id: string, updates: Partial<Character>): Character | null {
  const dbUpdates: Partial<DBCharacter> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.personalityTemplate !== undefined) dbUpdates.personalityTemplate = updates.personalityTemplate;
  if (updates.customPersonality !== undefined) dbUpdates.customPersonality = updates.customPersonality;
  if (updates.modelUrl !== undefined) dbUpdates.modelUrl = updates.modelUrl;
  if (updates.mood !== undefined) dbUpdates.mood = updates.mood;
  if (updates.live2dPosition) {
    dbUpdates.positionX = updates.live2dPosition.x;
    dbUpdates.positionY = updates.live2dPosition.y;
    dbUpdates.positionScale = updates.live2dPosition.scale;
  }
  if (updates.apiProvider !== undefined) dbUpdates.apiProvider = updates.apiProvider;
  if (updates.apiKey !== undefined) dbUpdates.apiKey = updates.apiKey;
  if (updates.apiModel !== undefined) dbUpdates.apiModel = updates.apiModel;
  if (updates.apiUrl !== undefined) dbUpdates.apiUrl = updates.apiUrl;
  if (updates.avatarUrl !== undefined) dbUpdates.avatarUrl = updates.avatarUrl;
  const result = dbCharacters.update(id, dbUpdates);
  return result ? toCharacter(result) : null;
}

export function deleteCharacter(id: string): boolean {
  return dbCharacters.delete(id);
}

// ========== 对话管理（永久保留，不自动删除）==========
export function loadConversation(characterId: string): ConversationData {
  const msgs = dbMessages.getAll(characterId);
  const meta = dbConvMeta.get(characterId);
  return {
    messages: msgs.map(m => ({ role: m.role, content: m.content })),
    lastMood: meta?.lastMood || 60,
    lastActiveTime: meta?.lastActiveTime || new Date().toISOString(),
    summary: meta?.summary || undefined,
    summaryUpTo: meta?.summaryUpTo || 0,
  };
}

export function saveConversation(characterId: string, data: ConversationData): void {
  // 消息已通过 dbMessages.addUser/addAssistant 实时写入，这里只更新元信息
  dbConvMeta.upsert({
    characterId,
    lastMood: data.lastMood,
    lastActiveTime: data.lastActiveTime,
    summary: data.summary || null,
    summaryUpTo: data.summaryUpTo || 0,
  });
}

export function clearConversation(characterId: string): void {
  dbMessages.deleteByCharacter(characterId);
  dbConvMeta.delete(characterId);
}

export function generateId(): string {
  return `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ========== 对话备份（SQLite 时代 -> 直接导出 JSON 快照）==========
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUP_DIR = path.join(__dirname, "../data/backup");
const MAX_BACKUPS = 50;
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export function backupConversation(characterId: string): void {
  try {
    const data = loadConversation(characterId);
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const backupFile = path.join(BACKUP_DIR, `${characterId}_${ts}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), "utf-8");

    const prefix = `${characterId}_`;
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(prefix) && f.endsWith(".json"))
      .sort();
    if (backups.length > MAX_BACKUPS) {
      for (const f of backups.slice(0, backups.length - MAX_BACKUPS)) {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      }
    }
  } catch (e) {
    console.error("[backup] 备份失败:", e);
  }
}
