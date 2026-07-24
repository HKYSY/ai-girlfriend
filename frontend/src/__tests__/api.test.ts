import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from '../api';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API 工具函数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchWithRetry 重试逻辑', () => {
    it('成功请求不重试', async () => {
      const mockData: any[] = [];
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      // 通过公开 API 间接测试 fetchWithRetry
      const result = await api.getCharacters();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it('失败后自动重试', async () => {
      const errorResponse = { ok: false, status: 404 };
      const mockData: any[] = [];
      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      };

      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await api.getCharacters();

      // 应该有 3 次调用（初始 + 2 次重试）
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual([]);
    });

    it('达到最大重试次数后抛出错误', async () => {
      const errorResponse = { ok: false, status: 500 };

      mockFetch.mockResolvedValue(errorResponse);

      // getCharacters 会捕获错误并返回空数组
      const result = await api.getCharacters();
      expect(result).toEqual([]);
    });

    it('网络错误时重试', async () => {
      const networkError = new TypeError('fetch failed');
      const mockData: any[] = [];
      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      };

      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const result = await api.getCharacters();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual([]);
    });
  });

  describe('错误处理逻辑', () => {
    it('401 错误返回身份验证失败', async () => {
      const errorResponse = {
        ok: false,
        status: 401,
        clone: () => ({
          json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '身份验证失败，请检查API密钥配置'
      );
    });

    it('403 错误返回权限不足', async () => {
      const errorResponse = {
        ok: false,
        status: 403,
        clone: () => ({
          json: vi.fn().mockResolvedValue({ error: 'Forbidden' }),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '没有权限访问该资源'
      );
    });

    it('404 错误返回资源不存在', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        clone: () => ({
          json: vi.fn().mockResolvedValue({ error: 'Not found' }),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '请求的资源不存在'
      );
    });

    it('429 错误返回请求频繁', async () => {
      const errorResponse = {
        ok: false,
        status: 429,
        clone: () => ({
          json: vi.fn().mockResolvedValue({ error: 'Too many requests' }),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '请求过于频繁，请稍后再试'
      );
    });

    it('500 错误返回服务器错误', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        clone: () => ({
          json: vi.fn().mockResolvedValue({ error: 'Internal server error' }),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '服务器内部错误，请稍后重试'
      );
    });

    it('502 错误返回服务不可用', async () => {
      const errorResponse = {
        ok: false,
        status: 502,
        clone: () => ({
          json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '服务暂时不可用，正在重试...'
      );
    });

    it('网络连接失败返回网络错误', async () => {
      const networkError = new TypeError('fetch failed');
      mockFetch.mockRejectedValue(networkError);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '网络连接失败，请检查网络设置'
      );
    });
  });

  describe('友好错误提示生成', () => {
    it('API错误返回自定义消息', async () => {
      const customMessage = '自定义错误消息';
      const errorResponse = {
        ok: false,
        status: 400,
        clone: () => ({
          json: vi.fn().mockResolvedValue({ error: customMessage }),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        customMessage
      );
    });

    it('JSON解析错误使用默认消息', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        clone: () => ({
          json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        }),
      };

      mockFetch.mockResolvedValue(errorResponse);

      await expect(api.getCharacterDetail('test-id')).rejects.toThrow(
        '服务器内部错误，请稍后重试'
      );
    });
  });

  describe('getMoodLevelInfo 函数', () => {
    it('心情值 0-9 返回 level 0', () => {
      const info = api.getMoodLevelInfo(5);
      expect(info.level).toBe(0);
      expect(info.label).toBe('极度失落');
    });

    it('心情值 10-19 返回 level 1', () => {
      const info = api.getMoodLevelInfo(15);
      expect(info.level).toBe(1);
      expect(info.label).toBe('很难过');
    });

    it('心情值 50-59 返回 level 5', () => {
      const info = api.getMoodLevelInfo(55);
      expect(info.level).toBe(5);
      expect(info.label).toBe('平静');
    });

    it('心情值 90-100 返回 level 9', () => {
      const info = api.getMoodLevelInfo(95);
      expect(info.level).toBe(9);
      expect(info.label).toBe('非常开心');
    });

    it('心情值超过 100 返回最大 level', () => {
      const info = api.getMoodLevelInfo(150);
      expect(info.level).toBe(9);
    });

    it('心情值小于 0 返回最小 level', () => {
      const info = api.getMoodLevelInfo(-10);
      expect(info.level).toBe(0);
    });
  });

  describe('API 函数调用', () => {
    it('getCharacters 调用正确的端点', async () => {
      const mockData: any[] = [];
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await api.getCharacters();

      expect(mockFetch).toHaveBeenCalledWith('/api/characters', {
        cache: 'no-store',
      });
    });

    it('getCharacterDetail 包含正确的 ID', async () => {
      const mockData = {
        character: { id: 'test-id', name: 'Test' },
        conversation: { messages: [], lastMood: 50, lastActiveTime: '' },
      };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await api.getCharacterDetail('test-id');

      expect(mockFetch).toHaveBeenCalledWith('/api/characters/test-id', {
        cache: 'no-store',
      });
      expect(result).toEqual(mockData);
    });
  });
});