type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: '#6366f1',
  info: '#06b6d4',
  warn: '#f59e0b',
  error: '#ef4444',
};

function isDebugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('recome_debug') === 'true';
  } catch {
    return false;
  }
}

class Logger {
  private readonly namespace: string;
  private minLevel: LogLevel;

  constructor(namespace: string, minLevel: LogLevel = 'info') {
    this.namespace = namespace;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    if (level === 'debug' && !isDebugEnabled()) return false;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  private format(level: LogLevel, message: string): string {
    return `[RecoMe:${this.namespace}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    console.debug(
      `%c${this.format('debug', message)}`,
      `color: ${COLORS.debug}; font-weight: bold`,
      ...args,
    );
  }

  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    console.debug(`%c${this.format('info', message)}`, `color: ${COLORS.info}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.format('warn', message), ...args);
  }

  error(message: string, error?: unknown): void {
    if (!this.shouldLog('error')) return;
    console.error(this.format('error', message), error ?? '');
  }

  child(subNamespace: string): Logger {
    return new Logger(`${this.namespace}:${subNamespace}`, this.minLevel);
  }
}

export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

export type { Logger };
