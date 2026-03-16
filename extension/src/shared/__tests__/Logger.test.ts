import { createLogger } from '@utils/Logger';

describe('createLogger', () => {
  it('returns an object with debug, info, warn, error methods', () => {
    const logger = createLogger('test');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('has a child() method that returns another logger', () => {
    const logger = createLogger('parent');
    expect(typeof logger.child).toBe('function');
    const child = logger.child('sub');
    expect(typeof child.debug).toBe('function');
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
  });
});

describe('Logger log levels', () => {
  let consoleSpy: {
    debug: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.debug.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  it('debug() does not throw', () => {
    const logger = createLogger('test');
    expect(() => logger.debug('debug message')).not.toThrow();
  });

  it('info() does not throw', () => {
    const logger = createLogger('test');
    expect(() => logger.info('info message')).not.toThrow();
  });

  it('warn() does not throw and calls console.warn', () => {
    const logger = createLogger('test');
    expect(() => logger.warn('warn message')).not.toThrow();
    expect(consoleSpy.warn).toHaveBeenCalled();
  });

  it('error() does not throw and calls console.error', () => {
    const logger = createLogger('test');
    expect(() => logger.error('error message')).not.toThrow();
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  it('warn() prefixes messages with namespace', () => {
    const logger = createLogger('MyModule');
    logger.warn('something happened');
    expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('MyModule'));
  });

  it('error() prefixes messages with namespace', () => {
    const logger = createLogger('MyModule');
    logger.error('something failed');
    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.stringContaining('MyModule'),
      expect.anything(),
    );
  });

  it('child logger includes parent namespace', () => {
    const parent = createLogger('Parent');
    const child = parent.child('Child');
    child.warn('child message');
    expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Parent:Child'));
  });
});
