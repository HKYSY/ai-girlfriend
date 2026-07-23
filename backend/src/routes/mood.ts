// 心情历史路由

import { Router } from 'express';
import { dbMoodHistory } from '../database.js';

const router = Router();

// 加载心情历史（支持 days 参数，默认 7 天）
function loadMoodHistory(characterId: string, days: number = 7): { t: number; mood: number }[] {
  return dbMoodHistory.getByDays(characterId, days).map(r => ({ t: r.timestamp, mood: r.mood }));
}

// 心情历史查询（支持 days 参数，默认 7 天）
router.get('/mood-history', (req, res) => {
  const characterId = req.query.characterId as string | undefined;
  const days = parseInt(req.query.days as string, 10) || 7;
  if (!characterId) return res.status(400).json({ error: 'characterId 必填' });
  const history = loadMoodHistory(characterId, Math.min(30, Math.max(1, days)));
  res.json({ ok: true, history, days: Math.min(30, Math.max(1, days)) });
});

export default router;