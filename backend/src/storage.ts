// 角色和对话的 JSON 文件持久化存储

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");
const CHARACTERS_FILE = path.join(DATA_DIR, "characters.json");

// 确保目录存在
fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });

// ========== 角色类型 ==========
export interface Character {
  id: string;
  name: string;
  personalityTemplate: string;
  customPersonality: string;
  modelUrl: string;
  mood: number; // 0-100
  live2dPosition: { x: number; y: number; scale: number };
  createdAt: string;
}

// ========== 对话数据类型 ==========
export interface ConversationData {
  messages: { role: string; content: string }[];
  lastMood: number;
  lastActiveTime: string; // ISO 时间戳
  summary?: string;        // 旧消息的摘要（长期记忆）
  summaryUpTo?: number;    // 摘要已覆盖的消息条数
}

// ========== 默认 Live2D 位置 ==========
export const DEFAULT_POSITION = { x: 0, y: 0, scale: 1 };

// ========== 角色管理 ==========
export function loadCharacters(): Character[] {
  try {
    if (!fs.existsSync(CHARACTERS_FILE)) return [];
    const raw = fs.readFileSync(CHARACTERS_FILE, "utf-8");
    return JSON.parse(raw) as Character[];
  } catch {
    return [];
  }
}

export function saveCharacters(characters: Character[]): void {
  fs.writeFileSync(CHARACTERS_FILE, JSON.stringify(characters, null, 2), "utf-8");
}

export function getCharacter(id: string): Character | undefined {
  return loadCharacters().find((c) => c.id === id);
}

export function addCharacter(character: Character): void {
  const list = loadCharacters();
  list.push(character);
  saveCharacters(list);
}

export function updateCharacter(id: string, updates: Partial<Character>): Character | null {
  const list = loadCharacters();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates, id: list[idx].id };
  saveCharacters(list);
  return list[idx];
}

export function deleteCharacter(id: string): boolean {
  const list = loadCharacters();
  const filtered = list.filter((c) => c.id !== id);
  if (filtered.length === list.length) return false;
  saveCharacters(filtered);
  // 同时删除对话文件
  const convFile = path.join(CONVERSATIONS_DIR, `${id}.json`);
  if (fs.existsSync(convFile)) fs.unlinkSync(convFile);
  return true;
}

// ========== 对话管理 ==========
export function loadConversation(characterId: string): ConversationData {
  const file = path.join(CONVERSATIONS_DIR, `${characterId}.json`);
  try {
    if (!fs.existsSync(file)) {
      return { messages: [], lastMood: 60, lastActiveTime: new Date().toISOString() };
    }
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as ConversationData;
  } catch {
    return { messages: [], lastMood: 60, lastActiveTime: new Date().toISOString() };
  }
}

export function saveConversation(characterId: string, data: ConversationData): void {
  const file = path.join(CONVERSATIONS_DIR, `${characterId}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function clearConversation(characterId: string): void {
  const file = path.join(CONVERSATIONS_DIR, `${characterId}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// 生成唯一 ID
export function generateId(): string {
  return `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ========== 对话备份 ==========
const BACKUP_DIR = path.join(DATA_DIR, "backup");
const MAX_BACKUPS = 50; // 每个角色最多保留50份备份

fs.mkdirSync(BACKUP_DIR, { recursive: true });

export function backupConversation(characterId: string): void {
  const srcFile = path.join(CONVERSATIONS_DIR, `${characterId}.json`);
  if (!fs.existsSync(srcFile)) return;

  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const backupFile = path.join(BACKUP_DIR, `${characterId}_${ts}.json`);

  try {
    const data = fs.readFileSync(srcFile, "utf-8");
    fs.writeFileSync(backupFile, data, "utf-8");

    // 清理旧备份：只保留最近 MAX_BACKUPS 份
    const prefix = `${characterId}_`;
    const backups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort();

    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
      for (const f of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      }
    }
  } catch (e) {
    console.error("[backup] 备份失败:", e);
  }
}
