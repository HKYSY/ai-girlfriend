import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../index';

describe('Mood Routes', () => {
  // 测试用例开始前等待数据库初始化
  beforeAll(async () => {
    // 等待数据库初始化完成
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /api/mood-history', () => {
    it('缺少characterId参数时应该返回400错误', async () => {
      const res = await request(app).get('/api/mood-history');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'characterId 必填');
    });

    it('提供characterId参数时应该返回200和心情历史', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试心情历史角色' });
      const characterId = createRes.body.id;

      const res = await request(app).get(`/api/mood-history?characterId=${characterId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('history');
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    it('应该支持days参数指定查询天数', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试心情历史天数' });
      const characterId = createRes.body.id;

      const res = await request(app).get(`/api/mood-history?characterId=${characterId}&days=14`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('days');
      expect(res.body.days).toBe(14);
    });

    it('心情历史记录应该包含t和mood字段', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试心情历史格式' });
      const characterId = createRes.body.id;

      const res = await request(app).get(`/api/mood-history?characterId=${characterId}`);
      expect(res.status).toBe(200);
      if (res.body.history.length > 0) {
        expect(res.body.history[0]).toHaveProperty('t');
        expect(res.body.history[0]).toHaveProperty('mood');
        expect(typeof res.body.history[0].t).toBe('number');
        expect(typeof res.body.history[0].mood).toBe('number');
      }
    });

    it('days参数超出范围时应该自动调整到有效范围', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试心情历史范围' });
      const characterId = createRes.body.id;

      // 测试最大值限制
      const res1 = await request(app).get(`/api/mood-history?characterId=${characterId}&days=100`);
      expect(res1.status).toBe(200);
      expect(res1.body.days).toBeLessThanOrEqual(30);

      // 测试最小值限制
      const res2 = await request(app).get(`/api/mood-history?characterId=${characterId}&days=0`);
      expect(res2.status).toBe(200);
      expect(res2.body.days).toBeGreaterThanOrEqual(1);
    });
  });
});