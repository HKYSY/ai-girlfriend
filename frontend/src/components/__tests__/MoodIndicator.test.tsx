import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MoodIndicator from '../MoodIndicator';

// Mock useEffect 动画相关
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useEffect: actual.useEffect,
  };
});

describe('MoodIndicator', () => {
  describe('心情值正确显示', () => {
    it('显示心情值 50', () => {
      render(<MoodIndicator mood={50} />);
      expect(screen.getByText('50')).toBeDefined();
    });

    it('显示心情值 100', () => {
      render(<MoodIndicator mood={100} />);
      expect(screen.getByText('100')).toBeDefined();
    });

    it('显示心情值 0', () => {
      render(<MoodIndicator mood={0} />);
      expect(screen.getByText('0')).toBeDefined();
    });
  });

  describe('心情emoji正确映射', () => {
    it('心情值 90-100 显示 😄', () => {
      const { container } = render(<MoodIndicator mood={95} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😄');
    });

    it('心情值 80-89 显示 😊', () => {
      const { container } = render(<MoodIndicator mood={85} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😊');
    });

    it('心情值 70-79 显示 🙂', () => {
      const { container } = render(<MoodIndicator mood={75} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('🙂');
    });

    it('心情值 60-69 显示 😐', () => {
      const { container } = render(<MoodIndicator mood={65} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😐');
    });

    it('心情值 50-59 显示 😐', () => {
      const { container } = render(<MoodIndicator mood={55} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😐');
    });

    it('心情值 40-49 显示 😕', () => {
      const { container } = render(<MoodIndicator mood={45} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😕');
    });

    it('心情值 30-39 显示 😢', () => {
      const { container } = render(<MoodIndicator mood={35} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😢');
    });

    it('心情值 20-29 显示 😢', () => {
      const { container } = render(<MoodIndicator mood={25} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😢');
    });

    it('心情值 10-19 显示 😭', () => {
      const { container } = render(<MoodIndicator mood={15} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😭');
    });

    it('心情值 0-9 显示 💔', () => {
      const { container } = render(<MoodIndicator mood={5} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('💔');
    });
  });

  describe('心情描述正确显示', () => {
    it('心情值 90 显示"超开心"', () => {
      render(<MoodIndicator mood={90} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('超开心');
    });

    it('心情值 80 显示"很开心"', () => {
      render(<MoodIndicator mood={80} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('很开心');
    });

    it('心情值 70 显示"开心"', () => {
      render(<MoodIndicator mood={70} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('开心');
    });

    it('心情值 60 显示"心情一般"', () => {
      render(<MoodIndicator mood={60} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('心情一般');
    });

    it('心情值 50 显示"还行"', () => {
      render(<MoodIndicator mood={50} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('还行');
    });

    it('心情值 40 显示"有点低落"', () => {
      render(<MoodIndicator mood={40} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('有点低落');
    });

    it('心情值 30 显示"难过"', () => {
      render(<MoodIndicator mood={30} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('难过');
    });

    it('心情值 20 显示"很难过"', () => {
      render(<MoodIndicator mood={20} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('很难过');
    });

    it('心情值 10 显示"伤心"', () => {
      render(<MoodIndicator mood={10} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('伤心');
    });

    it('心情值 0 显示"心碎"', () => {
      render(<MoodIndicator mood={0} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('心碎');
    });
  });

  describe('不同心情值对应不同的emoji', () => {
    it('边界值测试：90 应显示 😄', () => {
      const { container } = render(<MoodIndicator mood={90} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😄');
    });

    it('边界值测试：89 应显示 😊', () => {
      const { container } = render(<MoodIndicator mood={89} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😊');
    });

    it('边界值测试：50 应显示 😐', () => {
      const { container } = render(<MoodIndicator mood={50} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😐');
    });

    it('边界值测试：49 应显示 😕', () => {
      const { container } = render(<MoodIndicator mood={49} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😕');
    });

    it('边界值测试：10 应显示 😭', () => {
      const { container } = render(<MoodIndicator mood={10} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('😭');
    });

    it('边界值测试：9 应显示 💔', () => {
      const { container } = render(<MoodIndicator mood={9} />);
      expect(container.querySelector('.mood-indicator-emoji')?.textContent).toBe('💔');
    });
  });

  describe('无障碍属性', () => {
    it('包含正确的 aria-label', () => {
      render(<MoodIndicator mood={75} />);
      const indicator = screen.getByRole('generic', { name: /当前心情/ });
      expect(indicator.getAttribute('aria-label')).toContain('当前心情');
    });

    it('包含正确的 title', () => {
      render(<MoodIndicator mood={80} />);
      const indicator = screen.getByTitle('心情值：80');
      expect(indicator).toBeDefined();
    });
  });
});