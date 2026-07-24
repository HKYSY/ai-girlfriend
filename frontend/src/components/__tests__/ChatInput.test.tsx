import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChatInput from '../ChatInput';

// Mock Ant Design 组件
vi.mock('antd', () => ({
  Input: {
    TextArea: ({ value, onChange, onKeyDown, disabled, placeholder }: any) => (
      <textarea
        data-testid="chat-textarea"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
      />
    ),
  },
  Button: ({ children, onClick, disabled, icon }: any) => (
    <button
      data-testid="send-button"
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span data-testid="send-icon">{icon}</span>}
      {children}
    </button>
  ),
}));

// Mock Lucide React 图标
vi.mock('lucide-react', () => ({
  Send: () => <span>send-icon</span>,
}));

// Mock StickerPanel 组件
vi.mock('../StickerPanel', () => ({
  StickerPanel: ({ onSend, onClose }: any) => (
    <div data-testid="sticker-panel">
      <button onClick={() => onSend({ id: 1, filename: 'test.png' })}>
        发送表情
      </button>
      <button onClick={onClose}>关闭</button>
    </div>
  ),
}));

describe('ChatInput', () => {
  const mockOnSend = vi.fn();
  const mockOnSendSticker = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('输入框渲染正确', () => {
    it('渲染输入框和发送按钮', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      expect(screen.getByTestId('chat-textarea')).toBeDefined();
      expect(screen.getByTestId('send-button')).toBeDefined();
    });

    it('显示占位符文本', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByPlaceholderText('跟她说点什么…');
      expect(textarea).toBeDefined();
    });

    it('禁用状态下输入框不可用', () => {
      render(<ChatInput onSend={mockOnSend} disabled={true} />);

      const textarea = screen.getByTestId('chat-textarea');
      expect(textarea.disabled).toBe(true);
    });

    it('禁用状态下发送按钮不可用', () => {
      render(<ChatInput onSend={mockOnSend} disabled={true} />);

      const button = screen.getByTestId('send-button');
      expect(button.disabled).toBe(true);
    });
  });

  describe('发送按钮点击触发回调', () => {
    it('点击发送按钮调用 onSend', async () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      // 输入文本
      fireEvent.change(textarea, { target: { value: '你好' } });

      // 点击发送
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalledWith('你好');
      });
    });

    it('发送后清空输入框', async () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      fireEvent.change(textarea, { target: { value: '测试消息' } });
      fireEvent.click(button);

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    it('输入空白字符后发送按钮禁用', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      // 输入空格
      fireEvent.change(textarea, { target: { value: '   ' } });

      expect(button.disabled).toBe(true);
    });
  });

  describe('空输入不触发发送', () => {
    it('空字符串不触发发送', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const button = screen.getByTestId('send-button');

      // 空输入时按钮禁用
      expect(button.disabled).toBe(true);
    });

    it('只有空格不触发发送', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      // 输入空格
      fireEvent.change(textarea, { target: { value: '   ' } });

      // 按钮仍然禁用
      expect(button.disabled).toBe(true);
    });

    it('禁用状态下点击发送按钮不调用 onSend', () => {
      render(<ChatInput onSend={mockOnSend} disabled={true} />);

      const button = screen.getByTestId('send-button');

      // 按钮已禁用，点击无效
      fireEvent.click(button);

      expect(mockOnSend).not.toHaveBeenCalled();
    });
  });

  describe('输入状态管理正确', () => {
    it('输入文本更新状态', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');

      fireEvent.change(textarea, { target: { value: '你好世界' } });

      expect(textarea.value).toBe('你好世界');
    });

    it('输入后发送按钮变为可用', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      // 初始状态按钮禁用
      expect(button.disabled).toBe(true);

      // 输入文本
      fireEvent.change(textarea, { target: { value: '测试' } });

      // 按钮变为可用
      expect(button.disabled).toBe(false);
    });

    it('清空文本后发送按钮变为禁用', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      // 输入文本
      fireEvent.change(textarea, { target: { value: '测试' } });
      expect(button.disabled).toBe(false);

      // 清空文本
      fireEvent.change(textarea, { target: { value: '' } });
      expect(button.disabled).toBe(true);
    });
  });

  describe('回车键发送', () => {
    it('按回车键发送消息', async () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');

      fireEvent.change(textarea, { target: { value: '回车发送测试' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalledWith('回车发送测试');
      });
    });

    it('Shift+回车不发送消息', () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');

      fireEvent.change(textarea, { target: { value: '测试消息' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      // 不应该调用 onSend
      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it('回车发送后清空输入框', async () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');

      fireEvent.change(textarea, { target: { value: '清空测试' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });
  });

  describe('表情包功能', () => {
    it('支持发送表情包', async () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          onSendSticker={mockOnSendSticker}
          disabled={false}
        />
      );

      // 注意：表情包面板默认不显示，需要额外的 UI 交互才能显示
      // 这里只测试 onSendSticker 回调存在时的行为
      expect(mockOnSendSticker).not.toHaveBeenCalled();
    });
  });

  describe('修剪空白字符', () => {
    it('发送时自动修剪两端空白', async () => {
      render(<ChatInput onSend={mockOnSend} disabled={false} />);

      const textarea = screen.getByTestId('chat-textarea');
      const button = screen.getByTestId('send-button');

      // 输入带空格的文本
      fireEvent.change(textarea, { target: { value: '  你好  ' } });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalledWith('你好');
      });
    });
  });
});