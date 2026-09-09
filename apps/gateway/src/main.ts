import { config } from './config.js';
import { logger } from './logger.js';
import { createDriver } from './drivers/index.js';
import { GatewayRunner } from './runner.js';

async function main(): Promise<void> {
  const cfg = config();
  const driver = createDriver();

  // Fail at startup with an actionable message rather than on the first real
  // send. Both applescript failure modes need someone to click something in
  // System Settings, so it is better to say so before anything is queued.
  try {
    await driver.preflight();
  } catch (err) {
    logger.error('preflight failed');
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const runner = new GatewayRunner(driver);

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    runner.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (cfg.GATEWAY_DRIVER === 'mock') {
    logger.warn('running with the mock driver -- no real iMessages will be sent');
  }

  await runner.start();
}

main().catch((err) => {
  logger.error('gateway failed to start', { error: String(err) });
  process.exit(1);
});
