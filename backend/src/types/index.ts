// 共享类型定义（从各模块重新导出）

export type { Character, ConversationData } from '../storage.js';
export type { PersonaSettings, PetState } from '../persona.js';
export type { DiaryEntry } from '../utils.js';
export type { DBMessage, DBCharacter } from '../database.js';

// 聊天消息类型
export interface ChatMessage {
  role: string;
  content: string;
}