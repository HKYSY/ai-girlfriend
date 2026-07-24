import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../index';

describe('Character Routes', () => {
  // 测试用例开始前等待数据库初始化
  beforeAll(async () => {
    // 等待数据库初始化完成
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /api/characters', () => {
    it('应该返回200状态码和角色列表数组', async () => {
      const res = await request(app).get('/api/characters');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('应该返回空数组或角色对象数组', async () => {
      const res = await request(app).get('/api/characters');
      expect(res.status).toBe(200);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('id');
        expect(res.body[0]).toHaveProperty('name');
        expect(res.body[0]).toHaveProperty('mood');
      }
    });
  });

  describe('POST /api/characters', () => {
    it('缺少name字段时应该返回400错误', async () => {
      const res = await request(app)
        .post('/api/characters')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('name 必填');
    });

    it('提供name字段时应该成功创建角色', async () => {
      const res = await request(app)
        .post('/api/characters')
        .send({ name: '测试角色' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', '测试角色');
      expect(res.body).toHaveProperty('mood');
      expect(res.body.mood).toBe(60); // 默认心情值
    });

    it('创建角色时应该有默认的personalityTemplate', async () => {
      const res = await request(app)
        .post('/api/characters')
        .send({ name: '测试角色2' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('personalityTemplate');
      expect(res.body.personalityTemplate).toBe('yuko');
    });
  });

  describe('GET /api/characters/:id', () => {
    it('角色不存在时应该返回404', async () => {
      const res = await request(app).get('/api/characters/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '角色不存在');
    });

    it('获取存在的角色应该返回角色详情和对话记录', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试获取角色' });
      const characterId = createRes.body.id;

      // 获取该角色
      const res = await request(app).get(`/api/characters/${characterId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('character');
      expect(res.body).toHaveProperty('conversation');
      expect(res.body.character).toHaveProperty('id', characterId);
      expect(res.body.character).toHaveProperty('name', '测试获取角色');
    });
  });

  describe('PUT /api/characters/:id', () => {
    it('更新不存在的角色应该返回404', async () => {
      const res = await request(app)
        .put('/api/characters/non-existent-id')
        .send({ mood: 80 });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '角色不存在');
    });

    it('应该成功更新角色属性', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试更新角色' });
      const characterId = createRes.body.id;

      // 更新该角色
      const res = await request(app)
        .put(`/api/characters/${characterId}`)
        .send({ mood: 90 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mood', 90);
    });
  });

  describe('DELETE /api/characters/:id', () => {
    it('删除不存在的角色应该返回404', async () => {
      const res = await request(app).delete('/api/characters/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', '角色不存在');
    });

    it('应该成功删除存在的角色', async () => {
      // 先创建一个角色
      const createRes = await request(app)
        .post('/api/characters')
        .send({ name: '测试删除角色' });
      const characterId = createRes.body.id;

      // 删除该角色
      const res = await request(app).delete(`/api/characters/${characterId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);

      // 验证角色已被删除
      const getRes = await request(app).get(`/api/characters/${characterId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('POST /api/test-connection', () => {
    it('缺少API Key时应该返回失败（如果环境变量中也没有配置）', async () => {
      const res = await request(app)
        .post('/api/test-connection')
        .send({ provider: 'deepseek' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok');
      // 如果环境变量中有DEEPSEEK_API_KEY，测试可能成功
      // 如果没有，应该返回失败
      if (res.body.ok === false) {
        expect(res.body).toHaveProperty('error');
      }
    });

    it('应该能够测试API连接状态', async () => {
      const res = await request(app)
        .post('/api/test-connection')
        .send({ provider: 'deepseek' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok');
      expect(typeof res.body.ok).toBe('boolean');
    });
  });
});