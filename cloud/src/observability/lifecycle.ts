import { logger } from './logger.js';

type ShutdownHook = () => Promise<void> | void;

const hooks: ShutdownHook[] = [];
let shuttingDown = false;

export function onShutdown(hook: ShutdownHook): void {
  hooks.push(hook);
}

export function installSignalHandlers(): void {
  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown signal received; draining');
    void runShutdown().then(
      () => {
        logger.info('shutdown complete');
        process.exit(0);
      },
      (err) => {
        logger.error({ err }, 'shutdown failed');
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}

async function runShutdown(): Promise<void> {
  for (const hook of [...hooks].reverse()) {
    try {
      await hook();
    } catch (err) {
      logger.error({ err }, 'shutdown hook failed');
    }
  }
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
