import { createApp } from './http/app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './db/prisma.js';
import { scheduler } from './scheduler/ticker.js';
import { getSettings } from './repositories/settings.js';

async function main(): Promise<void> {
  const config = env();

  // Fail fast: a server that starts without a database only discovers it on the
  // first request, which is a worse outcome than refusing to boot.
  await prisma.$queryRaw`SELECT 1`;
  const settings = await getSettings();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        intervalSeconds: settings.sendIntervalSeconds,
        policy: settings.policy,
      },
      'server listening',
    );
  });

  scheduler.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    scheduler.stop();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
