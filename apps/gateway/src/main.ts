import { config } from './config.js';
import { logger } from './logger.js';
import { createDriver } from './drivers/index.js';
import { createRunner } from './runner/index.js';

/** A send that has not finished by then is not going to. */
const SHUTDOWN_DEADLINE_MS = 10_000;

async function main(): Promise<void> {
  const cfg = config();
  const driver = createDriver();

  if (cfg.GATEWAY_DRIVER === 'mock') {
    logger.warn('running with the mock driver -- no real iMessages will be sent');
  }

  const runner = createRunner(driver);

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down -- finishing the current send', { signal });

    const deadline = setTimeout(() => {
      logger.error('shutdown deadline reached, exiting');
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    deadline.unref();

    void runner.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await runner.start();
}

main().catch((err) => {
  logger.error('gateway failed to start', { error: String(err) });
  process.exit(1);
});
