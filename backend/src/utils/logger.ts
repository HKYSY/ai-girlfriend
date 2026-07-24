// 简单的结构化日志工具
interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp?: string;
  context?: Record<string, any>;
}

class Logger {
  private formatMessage(entry: LogEntry): string {
    return JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString()
    });
  }

  info(message: string, context?: Record<string, any>) {
    console.log(this.formatMessage({ level: 'info', message, context }));
  }

  warn(message: string, context?: Record<string, any>) {
    console.warn(this.formatMessage({ level: 'warn', message, context }));
  }

  error(message: string, context?: Record<string, any>) {
    console.error(this.formatMessage({ level: 'error', message, context }));
  }

  debug(message: string, context?: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatMessage({ level: 'debug', message, context }));
    }
  }
}

export const logger = new Logger();