import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../index';

describe('Diary Routes', () => {
  // 测试用例开始前等待数据库初始化
  beforeAll(async () => {
    // 等待数据库初始化完成
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /api/diary', () => {
    it('缺少characterId参数时应该返回400错误', async () => {
      const res = await request(app).get('/api/diary');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'characterId 必填');
    });

    it('提供characterId参数时应该返回200和日记列表', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试日记角色' });
      const characterId = createRes.body.id;

      const res = await request(app).get(`/api/diary?characterId=${characterId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('entries');
      expect(Array.isArray(res.body.entries)).toBe(true);
    });

    it('应该返回hasToday字段标识今天是否已有日记', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试日记hasToday' });
      const characterId = createRes.body.id;

      const res = await request(app).get(`/api/diary?characterId=${characterId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hasToday');
      expect(typeof res.body.hasToday).toBe('boolean');
    });
  });

  describe('POST /api/diary/generate', () => {
    it('缺少characterId参数时应该返回400错误', async () => {
      const res = await request(app)
        .post('/api/diary/generate')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'characterId 必填');
    });

    it('提供不存在的characterId时应该返回失败', async () => {
      const res = await request(app)
        .post('/api/diary/generate')
        .send({ characterId: 'non-existent-id' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', false);
    });
  });

  describe('POST /api/diary/backfill', () => {
    it('缺少characterId参数时应该返回400错误', async () => {
      const res = await request(app)
        .post('/api/diary/backfill')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'characterId 必填');
    });

    it('提供characterId时应该返回成功和生成列表', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试补生成日记' });
      const characterId = createRes.body.id;

      const res = await request(app)
        .post('/api/diary/backfill')
        .send({ characterId, days: 1 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('generated');
      expect(Array.isArray(res.body.generated)).toBe(true);
      expect(res.body).toHaveProperty('checked');
    });
  });
});