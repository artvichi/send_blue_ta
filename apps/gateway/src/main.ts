import { config } from './config.js';
import { logger } from './logger.js';
import { createDriver } from './drivers/index.js';
import { GatewayRunner } from './runner.js';

async function main(): Promise<void> {
  const cfg = config();
  const driver = createDriver();

  // Report rather than refuse: the permissions the real driver needs are
  // granted by a human in System Settings, and the dashboard is where we ask.
  const caps = await driver.capabilities();
  if (!caps.ready) {
    logger.warn('driver not ready -- the dashboard will show what is missing', {
      fullDiskAccess: caps.fullDiskAccess,
      automation: caps.automation,
      hostApp: caps.hostApp,
    });
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
