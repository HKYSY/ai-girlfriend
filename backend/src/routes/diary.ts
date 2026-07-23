// 日记系统路由

import { Router } from 'express';
import { dbDiary } from '../database.js';
import { mergeDiaryEntries } from '../utils.js';
import type { DiaryEntry } from '../utils.js';

const router = Router();

// 加载某角色的日记列表（已在数据库模块中实现，这里作为辅助函数）
function loadDiary(characterId: string): DiaryEntry[] {
  const rows = dbDiary.getAll(characterId);
  const entries: DiaryEntry[] = rows.map(r => ({ date: r.date, content: r.content, mood: r.mood, createdAt: r.createdAt }));
  const merged = mergeDiaryEntries(entries);
  if (merged.length < entries.length) {
    // 清理重复：重新写入
    // 数据库模式下由 add/updateByDate 自动处理
  }
  return merged.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// 检查今天是否已有日记
function hasTodayDiary(characterId: string): boolean {
  return dbDiary.hasToday(characterId);
}

// 获取日记列表
router.get('/diary', (req, res) => {
  const characterId = req.query.characterId as string | undefined;
  if (!characterId) return res.status(400).json({ error: 'characterId 必填' });
  const entries = loadDiary(characterId);
  res.json({ ok: true, entries, hasToday: hasTodayDiary(characterId) });
});

// 注意：POST /api/diary/generate 和 POST /api/diary/backfill 路由保留在 index.ts 中
// 因为它们依赖 generateDiary 和 backfillDiaries 函数，这些函数包含大量 AI 调用逻辑

export default router;