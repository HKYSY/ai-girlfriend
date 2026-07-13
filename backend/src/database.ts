// SQLite 数据库层 —— 替代 JSON 文件存储
// 提供完整的持久化、迁移、CRUD 操作

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../data/app.db");

// 确保 data 目录存在
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 单例数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式提升性能
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ========== 类型定义 ==========
export interface DBCharacter {
  id: string;
  name: string;
  personalityTemplate: string;
  customPersonality: string;
  modelUrl: string;
  mood: number;
  positionX: number;
  positionY: number;
  positionScale: number;
  createdAt: string;
  updatedAt: string | null;
  apiProvider: string;
  apiKey: string;
  apiModel: string;
  apiUrl: string;
}

export interface DBMessage {
  id: number;
  characterId: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface DBConversationMeta {
  characterId: string;
  lastMood: number;
  lastActiveTime: string | null;
  summary: string | null;
  summaryUpTo: number;
}

export interface DBMemoryFact {
  id: number;
  characterId: string;
  fact: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface DBMemorySummary {
  id: number;
  characterId: string;
  messageRangeStart: number | null;
  messageRangeEnd: number | null;
  summary: string;
  createdAt: string;
}

export interface DBPetState {
  characterId: string;
  coins: number;
  hunger: number;
  fatigue: number;
  intimacy: number;
  lastSignDate: string;
  chatCount: number;
  lastActiveTime: string | null;
  activeGuessGame: string | null;
  totalChats: number;
  totalSignIns: number;
  totalDates: number;
  totalGameWins: number;
  totalGuessWins: number;
  totalWheelJackpots: number;
  maxIntimacy: number;
  maxCoins: number;
  unlockedAchievements: string;
}

export interface DBMoodPoint {
  id: number;
  characterId: string;
  timestamp: number;
  mood: number;
}

export interface DBDiaryEntry {
  id: number;
  characterId: string;
  date: string;
  content: string;
  mood: number;
  createdAt: string;
}

// ========== 初始化 ==========
export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      personalityTemplate TEXT DEFAULT 'yuko',
      customPersonality TEXT DEFAULT '',
      modelUrl TEXT DEFAULT '/live2d/icegirl/IceGirl.model3.json',
      mood INTEGER DEFAULT 60,
      positionX REAL DEFAULT 0,
      positionY REAL DEFAULT 0,
      positionScale REAL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      apiProvider TEXT DEFAULT 'deepseek',
      apiKey TEXT DEFAULT '',
      apiModel TEXT DEFAULT '',
      apiUrl TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_msg_char ON messages(characterId);
    CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(characterId, createdAt);

    CREATE TABLE IF NOT EXISTS conversation_meta (
      characterId TEXT PRIMARY KEY,
      lastMood INTEGER DEFAULT 60,
      lastActiveTime TEXT,
      summary TEXT,
      summaryUpTo INTEGER DEFAULT 0,
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId TEXT NOT NULL,
      fact TEXT NOT NULL,
      type TEXT DEFAULT 'general' CHECK(type IN ('general','date','promise','like','dislike','event','personal')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_facts_char ON memory_facts(characterId);

    CREATE TABLE IF NOT EXISTS memory_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId TEXT NOT NULL,
      messageRangeStart INTEGER,
      messageRangeEnd INTEGER,
      summary TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_summ_char ON memory_summaries(characterId);

    CREATE TABLE IF NOT EXISTS pet_state (
      characterId TEXT PRIMARY KEY,
      coins INTEGER DEFAULT 100,
      hunger INTEGER DEFAULT 70,
      fatigue INTEGER DEFAULT 20,
      intimacy INTEGER DEFAULT 30,
      lastSignDate TEXT DEFAULT '',
      chatCount INTEGER DEFAULT 0,
      lastActiveTime TEXT,
      activeGuessGame TEXT DEFAULT NULL,
      totalChats INTEGER DEFAULT 0,
      totalSignIns INTEGER DEFAULT 0,
      totalDates INTEGER DEFAULT 0,
      totalGameWins INTEGER DEFAULT 0,
      totalGuessWins INTEGER DEFAULT 0,
      totalWheelJackpots INTEGER DEFAULT 0,
      maxIntimacy INTEGER DEFAULT 30,
      maxCoins INTEGER DEFAULT 100,
      unlockedAchievements TEXT DEFAULT '[]',
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mood_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      mood INTEGER NOT NULL,
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mood_char ON mood_history(characterId);
    CREATE INDEX IF NOT EXISTS idx_mood_time ON mood_history(timestamp);

    CREATE TABLE IF NOT EXISTS diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      characterId TEXT NOT NULL,
      date TEXT NOT NULL,
      content TEXT NOT NULL,
      mood INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_diary_char ON diary(characterId);
  `);

  console.log("[db] 数据库初始化完成:", DB_PATH);
}

// ========== 旧数据迁移（JSON → SQLite）==========
export function migrateFromJSON(): void {
  const dataDir = path.join(__dirname, "../data");

  const row = db.prepare("SELECT COUNT(*) as cnt FROM characters").get() as { cnt: number } | undefined;
  if (row && row.cnt > 0) {
    console.log("[db] 数据库已有数据，跳过迁移");
    return;
  }

  console.log("[db] 开始从 JSON 迁移数据...");

  // 1. 角色
  const charsFile = path.join(dataDir, "characters.json");
  if (fs.existsSync(charsFile)) {
    const chars: DBCharacter[] = JSON.parse(fs.readFileSync(charsFile, "utf-8"));
    const stmt = db.prepare(`INSERT OR REPLACE INTO characters
      (id, name, personalityTemplate, customPersonality, modelUrl, mood, positionX, positionY, positionScale, createdAt, updatedAt)
      VALUES (@id, @name, @pt, @cp, @mu, @mood, @px, @py, @ps, @ca, @ua)`);
    const insertAll = db.transaction(() => {
      for (const c of chars) {
        stmt.run({
          id: c.id, name: c.name, pt: c.personalityTemplate || "yuko", cp: c.customPersonality || "",
          mu: c.modelUrl || "/live2d/icegirl/IceGirl.model3.json", mood: c.mood || 60,
          px: (c as any).live2dPosition?.x || 0, py: (c as any).live2dPosition?.y || 0,
          ps: (c as any).live2dPosition?.scale || 1, ca: c.createdAt || new Date().toISOString(), ua: null,
        });
      }
    });
    insertAll();
    console.log(`[db] 迁移角色: ${chars.length} 条`);
  }

  // 2. 对话
  const convDir = path.join(dataDir, "conversations");
  if (fs.existsSync(convDir)) {
    const files = fs.readdirSync(convDir).filter(f => f.endsWith(".json"));
    const insMsg = db.prepare("INSERT INTO messages (characterId, role, content, createdAt) VALUES (?, ?, ?, ?)");
    const insMeta = db.prepare("INSERT OR REPLACE INTO conversation_meta (characterId, lastMood, lastActiveTime, summary, summaryUpTo) VALUES (?, ?, ?, ?, ?)");

    for (const file of files) {
      const charId = file.replace(".json", "");
      const conv = JSON.parse(fs.readFileSync(path.join(convDir, file), "utf-8"));
      const msgs: Array<{ role: string; content: string }> = conv.messages || [];

      const batchInsert = db.transaction(() => {
        for (let i = 0; i < msgs.length; i++) {
          insMsg.run(charId, msgs[i].role, msgs[i].content, new Date(Date.now() - (msgs.length - i) * 1000).toISOString());
        }
      });
      batchInsert();
      insMeta.run(charId, conv.lastMood || 60, conv.lastActiveTime || null, conv.summary || null, conv.summaryUpTo || 0);
    }
    console.log(`[db] 迁移对话: ${files.length} 个角色`);
  }

  // 3. 宠物状态
  const petDir = path.join(dataDir, "petstate");
  if (fs.existsSync(petDir)) {
    const files = fs.readdirSync(petDir).filter(f => f.endsWith(".json"));
    const insPet = db.prepare(`INSERT OR REPLACE INTO pet_state
      (characterId, coins, hunger, fatigue, intimacy, lastSignDate, chatCount, lastActiveTime, activeGuessGame,
       totalChats, totalSignIns, totalDates, totalGameWins, totalGuessWins, totalWheelJackpots, maxIntimacy, maxCoins, unlockedAchievements)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const file of files) {
      const charId = file.replace(".json", "");
      const s = JSON.parse(fs.readFileSync(path.join(petDir, file), "utf-8"));
      insPet.run(
        charId, s.coins||100, s.hunger||70, s.fatigue||20, s.intimacy||30,
        s.lastSignDate||"", s.chatCount||0, s.lastActiveTime||null,
        s.activeGuessGame ? JSON.stringify(s.activeGuessGame) : null,
        s.totalChats||0, s.totalSignIns||0, s.totalDates||0, s.totalGameWins||0,
        s.totalGuessWins||0, s.totalWheelJackpots||0, s.maxIntimacy||30, s.maxCoins||100,
        JSON.stringify(s.unlockedAchievements||[])
      );
    }
    console.log(`[db] 迁移桌宠状态: ${files.length} 个角色`);
  }

  // 4. 心情历史
  const moodDir = path.join(dataDir, "moodhistory");
  if (fs.existsSync(moodDir)) {
    const files = fs.readdirSync(moodDir).filter(f => f.endsWith(".json"));
    const insMood = db.prepare("INSERT INTO mood_history (characterId, timestamp, mood) VALUES (?, ?, ?)");
    for (const file of files) {
      const charId = file.replace(".json", "");
      const points: Array<{ t: number; mood: number }> = JSON.parse(fs.readFileSync(path.join(moodDir, file), "utf-8"));
      const batch = db.transaction(() => {
        for (const p of points) insMood.run(charId, p.t, p.mood);
      });
      batch();
    }
    console.log(`[db] 迁移心情历史: ${files.length} 个角色`);
  }

  // 5. 日记
  const diaryDir = path.join(dataDir, "diary");
  if (fs.existsSync(diaryDir)) {
    const files = fs.readdirSync(diaryDir).filter(f => f.endsWith(".json"));
    const insDiary = db.prepare("INSERT INTO diary (characterId, date, content, mood, createdAt) VALUES (?, ?, ?, ?, ?)");
    for (const file of files) {
      const charId = file.replace(".json", "");
      const entries: Array<{ date: string; content: string; mood: number; createdAt: string }> = JSON.parse(fs.readFileSync(path.join(diaryDir, file), "utf-8"));
      const batch = db.transaction(() => {
        for (const e of entries) insDiary.run(charId, e.date, e.content, e.mood, e.createdAt);
      });
      batch();
    }
    console.log(`[db] 迁移日记: ${files.length} 个角色`);
  }

  console.log("[db] JSON → SQLite 迁移完成！");
}

// ========== 角色操作 ==========
export const dbCharacters = {
  getAll: () => db.prepare("SELECT * FROM characters ORDER BY createdAt").all() as DBCharacter[],
  getById: (id: string) => db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as DBCharacter | undefined,
  add: (c: DBCharacter) => {
    db.prepare(`INSERT INTO characters (id, name, personalityTemplate, customPersonality, modelUrl, mood, positionX, positionY, positionScale, createdAt, apiProvider, apiKey, apiModel, apiUrl)
      VALUES (@id, @name, @pt, @cp, @mu, @mood, @px, @py, @ps, @ca, @ap, @ak, @am, @au)`).run({
      id: c.id, name: c.name, pt: c.personalityTemplate || "yuko", cp: c.customPersonality || "",
      mu: c.modelUrl || "/live2d/icegirl/IceGirl.model3.json", mood: c.mood || 60,
      px: c.positionX || 0, py: c.positionY || 0, ps: c.positionScale || 1,
      ca: c.createdAt || new Date().toISOString(),
      ap: c.apiProvider || "deepseek", ak: c.apiKey || "", am: c.apiModel || "", au: c.apiUrl || "",
    });
    return c;
  },
  update: (id: string, updates: Partial<DBCharacter>) => {
    const existing = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as DBCharacter | undefined;
    if (!existing) return null;
    const merged = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    db.prepare(`UPDATE characters SET name=@name, personalityTemplate=@personalityTemplate, customPersonality=@customPersonality,
      modelUrl=@modelUrl, mood=@mood, positionX=@positionX, positionY=@positionY, positionScale=@positionScale,
      apiProvider=@apiProvider, apiKey=@apiKey, apiModel=@apiModel, apiUrl=@apiUrl, updatedAt=@updatedAt
      WHERE id=@id`).run(merged);
    return merged;
  },
  delete: (id: string) => {
    const result = db.prepare("DELETE FROM characters WHERE id = ?").run(id);
    return result.changes > 0;
  },
};

// ========== 消息操作（永久保留 + 分页）==========
export const dbMessages = {
  addUser: (characterId: string, content: string) => {
    return db.prepare("INSERT INTO messages (characterId, role, content) VALUES (?, 'user', ?)").run(characterId, content);
  },
  addAssistant: (characterId: string, content: string) => {
    return db.prepare("INSERT INTO messages (characterId, role, content) VALUES (?, 'assistant', ?)").run(characterId, content);
  },
  countByCharacter: (characterId: string) => {
    return (db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE characterId = ?").get(characterId) as { cnt: number }).cnt;
  },
  getRecent: (characterId: string, limit: number) => {
    return db.prepare("SELECT * FROM (SELECT * FROM messages WHERE characterId = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC")
      .all(characterId, limit) as DBMessage[];
  },
  getAfterId: (characterId: string, afterId: number, limit: number) => {
    return db.prepare("SELECT * FROM messages WHERE characterId = ? AND id > ? ORDER BY id ASC LIMIT ?")
      .all(characterId, afterId, limit) as DBMessage[];
  },
  getBeforeId: (characterId: string, beforeId: number, limit: number) => {
    return db.prepare("SELECT * FROM (SELECT * FROM messages WHERE characterId = ? AND id < ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC")
      .all(characterId, beforeId, limit) as DBMessage[];
  },
  getLastId: (characterId: string) => {
    const row = db.prepare("SELECT MAX(id) as maxId FROM messages WHERE characterId = ?").get(characterId) as { maxId: number | null };
    return row?.maxId || 0;
  },
  getAll: (characterId: string) => {
    return db.prepare("SELECT * FROM messages WHERE characterId = ? ORDER BY id ASC").all(characterId) as DBMessage[];
  },
  search: (characterId: string, query: string, limit: number = 10) => {
    return db.prepare("SELECT * FROM messages WHERE characterId = ? AND content LIKE ? ORDER BY id DESC LIMIT ?")
      .all(characterId, `%${query}%`, limit) as DBMessage[];
  },
  deleteByCharacter: (characterId: string) => {
    return db.prepare("DELETE FROM messages WHERE characterId = ?").run(characterId);
  },
};

// ========== 对话元信息 ==========
export const dbConvMeta = {
  get: (characterId: string) => {
    return db.prepare("SELECT * FROM conversation_meta WHERE characterId = ?").get(characterId) as DBConversationMeta | undefined;
  },
  upsert: (meta: DBConversationMeta) => {
    db.prepare(`INSERT OR REPLACE INTO conversation_meta (characterId, lastMood, lastActiveTime, summary, summaryUpTo)
      VALUES (?, ?, ?, ?, ?)`).run(meta.characterId, meta.lastMood, meta.lastActiveTime, meta.summary, meta.summaryUpTo);
  },
  delete: (characterId: string) => {
    db.prepare("DELETE FROM conversation_meta WHERE characterId = ?").run(characterId);
  },
};

// ========== 事实记忆 ==========
export const dbFacts = {
  getAll: (characterId: string) => {
    return db.prepare("SELECT * FROM memory_facts WHERE characterId = ? ORDER BY id").all(characterId) as DBMemoryFact[];
  },
  getByType: (characterId: string, type: string) => {
    return db.prepare("SELECT * FROM memory_facts WHERE characterId = ? AND type = ?").all(characterId, type) as DBMemoryFact[];
  },
  upsert: (fact: Omit<DBMemoryFact, "id" | "createdAt" | "updatedAt">) => {
    const existing = db.prepare("SELECT id FROM memory_facts WHERE characterId = ? AND fact = ?").get(fact.characterId, fact.fact) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE memory_facts SET type = ?, updatedAt = ? WHERE id = ?").run(fact.type, new Date().toISOString(), existing.id);
    } else {
      db.prepare("INSERT INTO memory_facts (characterId, fact, type) VALUES (?, ?, ?)").run(fact.characterId, fact.fact, fact.type);
    }
  },
  delete: (id: number) => db.prepare("DELETE FROM memory_facts WHERE id = ?").run(id),
  deleteByCharacter: (characterId: string) => db.prepare("DELETE FROM memory_facts WHERE characterId = ?").run(characterId),
  countByCharacter: (characterId: string) => {
    return (db.prepare("SELECT COUNT(*) as cnt FROM memory_facts WHERE characterId = ?").get(characterId) as { cnt: number }).cnt;
  },
};

// ========== 记忆摘要 ==========
export const dbSummaries = {
  getLatest: (characterId: string) => {
    return db.prepare("SELECT * FROM memory_summaries WHERE characterId = ? ORDER BY id DESC LIMIT 1").get(characterId) as DBMemorySummary | undefined;
  },
  add: (s: Omit<DBMemorySummary, "id" | "createdAt">) => {
    return db.prepare("INSERT INTO memory_summaries (characterId, messageRangeStart, messageRangeEnd, summary) VALUES (?, ?, ?, ?)")
      .run(s.characterId, s.messageRangeStart, s.messageRangeEnd, s.summary);
  },
  getAll: (characterId: string) => {
    return db.prepare("SELECT * FROM memory_summaries WHERE characterId = ? ORDER BY id DESC").all(characterId) as DBMemorySummary[];
  },
};

// ========== 宠物状态 ==========
export const dbPetState = {
  get: (characterId: string) => {
    const row = db.prepare("SELECT * FROM pet_state WHERE characterId = ?").get(characterId) as DBPetState | undefined;
    if (!row) {
      const defaults: DBPetState = {
        characterId, coins: 100, hunger: 70, fatigue: 20, intimacy: 30,
        lastSignDate: "", chatCount: 0, lastActiveTime: null, activeGuessGame: null,
        totalChats: 0, totalSignIns: 0, totalDates: 0, totalGameWins: 0,
        totalGuessWins: 0, totalWheelJackpots: 0, maxIntimacy: 30, maxCoins: 100, unlockedAchievements: "[]",
      };
      db.prepare(`INSERT INTO pet_state (characterId, coins, hunger, fatigue, intimacy, lastSignDate, chatCount, activeGuessGame,
        totalChats, totalSignIns, totalDates, totalGameWins, totalGuessWins, totalWheelJackpots, maxIntimacy, maxCoins, unlockedAchievements)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        characterId, 100, 70, 20, 30, "", 0, null, 0, 0, 0, 0, 0, 0, 30, 100, "[]");
      return defaults;
    }
    return row;
  },
  upsert: (ps: DBPetState) => {
    db.prepare(`INSERT OR REPLACE INTO pet_state
      (characterId, coins, hunger, fatigue, intimacy, lastSignDate, chatCount, lastActiveTime, activeGuessGame,
       totalChats, totalSignIns, totalDates, totalGameWins, totalGuessWins, totalWheelJackpots, maxIntimacy, maxCoins, unlockedAchievements)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      ps.characterId, ps.coins, ps.hunger, ps.fatigue, ps.intimacy,
      ps.lastSignDate, ps.chatCount, ps.lastActiveTime, ps.activeGuessGame,
      ps.totalChats, ps.totalSignIns, ps.totalDates, ps.totalGameWins,
      ps.totalGuessWins, ps.totalWheelJackpots, ps.maxIntimacy, ps.maxCoins, ps.unlockedAchievements);
  },
};

// ========== 心情历史 ==========
export const dbMoodHistory = {
  add: (characterId: string, mood: number) => {
    db.prepare("INSERT INTO mood_history (characterId, timestamp, mood) VALUES (?, ?, ?)").run(characterId, Date.now(), Math.round(mood));
    // 清理：保留最近 30 天 + 最多 500 个点
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    db.prepare("DELETE FROM mood_history WHERE characterId = ? AND timestamp < ?").run(characterId, cutoff);
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM mood_history WHERE characterId = ?").get(characterId) as { cnt: number }).cnt;
    if (count > 500) {
      db.prepare("DELETE FROM mood_history WHERE id IN (SELECT id FROM mood_history WHERE characterId = ? ORDER BY timestamp ASC LIMIT ?)")
        .run(characterId, count - 500);
    }
  },
  getByDays: (characterId: string, days: number) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.prepare("SELECT * FROM mood_history WHERE characterId = ? AND timestamp >= ? ORDER BY timestamp ASC")
      .all(characterId, cutoff) as DBMoodPoint[];
  },
};

// ========== 日记 ==========
export const dbDiary = {
  getAll: (characterId: string) => {
    return db.prepare("SELECT * FROM diary WHERE characterId = ? ORDER BY date DESC, createdAt DESC").all(characterId) as DBDiaryEntry[];
  },
  hasToday: (characterId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const row = db.prepare("SELECT COUNT(*) as cnt FROM diary WHERE characterId = ? AND date = ?").get(characterId, today) as { cnt: number };
    return row.cnt > 0;
  },
  getByDate: (characterId: string, date: string) => {
    return db.prepare("SELECT * FROM diary WHERE characterId = ? AND date = ? ORDER BY createdAt DESC").all(characterId, date) as DBDiaryEntry[];
  },
  add: (entry: Omit<DBDiaryEntry, "id">) => {
    db.prepare("INSERT INTO diary (characterId, date, content, mood, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(entry.characterId, entry.date, entry.content, entry.mood, entry.createdAt);
    // 清理 90 天以上
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    db.prepare("DELETE FROM diary WHERE characterId = ? AND date < ?").run(entry.characterId, cutoff.toISOString().slice(0, 10));
  },
  updateByDate: (characterId: string, date: string, content: string, mood: number) => {
    db.prepare("UPDATE diary SET content = ?, mood = ?, createdAt = ? WHERE characterId = ? AND date = ?")
      .run(content, mood, new Date().toISOString(), characterId, date);
  },
};

// 导出数据库连接（供事务等高级操作）
export { db };

// 初始化（首次调用时执行）
initDatabase();
