// 角色管理路由

import { Router } from 'express';
import { loadCharacters, getCharacter, addCharacter, updateCharacter, deleteCharacter, loadConversation, clearConversation, DEFAULT_POSITION } from '../storage.js';
import { dbMessages, dbConvMeta, localDateStr } from '../database.js';
import type { Character } from '../storage.js';
import type { DBCharacter } from '../database.js';

const router = Router();

// 获取所有角色
router.get('/characters', (_req, res) => {
  res.json(loadCharacters());
});

// 获取单个角色详情
router.get('/characters/:id', (req, res) => {
  const char = getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: '角色不存在' });
  const conv = loadConversation(req.params.id);

  // 需求1C：渐变惩罚心情
  // 检测上次活跃时间与当前时间的天数差，按规则调整心情
  const meta = dbConvMeta.get(req.params.id);
  if (meta?.lastActiveTime) {
    const lastActive = new Date(meta.lastActiveTime).getTime();
    const now = Date.now();
    const daysSince = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));

    if (daysSince >= 1 && char.mood > 0) {
      let newMood: number;
      if (daysSince === 1) {
        newMood = Math.max(0, char.mood - 30);
      } else if (daysSince === 2) {
        newMood = Math.max(0, char.mood - 50);
      } else {
        newMood = 0;
      }
      if (newMood < char.mood) {
        console.log(`[mood-penalty] ${char.name}: ${daysSince}天未活跃, 心情 ${char.mood}→${newMood}`);
        char.mood = newMood;
        updateCharacter(req.params.id, { mood: newMood });
      }
    }
  }

  // 过滤掉互动消息（hidden=1 或以"（互动）"开头的 user 消息）
  const filteredConv = {
    ...conv,
    messages: conv.messages.filter(
      (m) => !(m.role === 'user' && m.content.startsWith('（互动）'))
    ),
  };
  res.json({ character: char, conversation: filteredConv });
});

// 创建角色
router.post('/characters', (req, res) => {
  const { name, personalityTemplate, customPersonality, modelUrl } = req.body as Partial<Character>;
  if (!name) return res.status(400).json({ error: 'name 必填' });

  const character: Character = {
    id: generateId(),
    name,
    personalityTemplate: personalityTemplate || 'yuko',
    customPersonality: customPersonality || '',
    modelUrl: modelUrl || '/live2d/icegirl/IceGirl.model3.json',
    mood: 60,
    live2dPosition: { ...DEFAULT_POSITION },
    createdAt: new Date().toISOString(),
    apiProvider: 'deepseek',
    apiKey: '',
    apiModel: '',
    apiUrl: '',
    avatarUrl: '',
  };
  addCharacter(character);
  console.log(`[characters] 创建角色: ${character.id} (${name})`);
  res.json(character);
});

// 更新角色
router.put('/characters/:id', (req, res) => {
  const updates = req.body as Partial<Character>;
  const updated = updateCharacter(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: '角色不存在' });
  console.log(`[characters] 更新角色: ${req.params.id}`);
  res.json(updated);
});

// 删除角色
router.delete('/characters/:id', (req, res) => {
  const ok = deleteCharacter(req.params.id);
  if (!ok) return res.status(404).json({ error: '角色不存在' });
  console.log(`[characters] 删除角色: ${req.params.id}`);
  res.json({ ok: true });
});

// 清空对话记忆
router.delete('/characters/:id/conversation', (req, res) => {
  clearConversation(req.params.id);
  // 重置心情为 60
  updateCharacter(req.params.id, { mood: 60 });
  res.json({ ok: true, message: '记忆已清空' });
});

// 导出某角色的全部对话记录（JSON 下载）
router.get('/characters/:id/export', (req, res) => {
  const char = getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: '角色不存在' });
  const messages = dbMessages.getAll(req.params.id, true).map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }));
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(char.name)}-conversation.json"`);
  res.json({
    character: { id: char.id, name: char.name, createdAt: char.createdAt, mood: char.mood },
    messages,
    total: messages.length,
    exportedAt: new Date().toISOString(),
  });
});

// 测试 API 连接
router.post('/test-connection', async (req, res) => {
  const { provider, apiKey, apiModel, apiUrl } = req.body as {
    provider?: string; apiKey?: string; apiModel?: string; apiUrl?: string;
  };

  const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  const DEFAULT_URL = 'https://api.deepseek.com/v1/chat/completions';

  const p = provider || 'deepseek';
  let url = apiUrl?.trim() || '';
  if (p === 'deepseek' && !url) url = DEFAULT_URL;
  if (p === 'openai' && !url) url = 'https://api.openai.com/v1/chat/completions';
  if (!url) return res.json({ ok: false, error: '未配置 API 地址' });

  const key = apiKey?.trim() || DEEPSEEK_API_KEY || '';
  const model = apiModel?.trim() || DEFAULT_MODEL;
  if (!key) return res.json({ ok: false, error: '未配置 API Key（角色和 .env 均为空）' });

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - start;
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.json({ ok: false, error: `HTTP ${response.status}${errText ? ': ' + errText.slice(0, 120) : ''}`, latency });
    }
    res.json({ ok: true, latency, model });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '请求超时（15秒）' : e.message) : '连接失败';
    res.json({ ok: false, error: msg });
  }
});

// 辅助函数：生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default router;