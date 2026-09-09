import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

declare global {
  // eslint-disable-next-line no-var
  var __sbPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Reused across hot reloads in development so `tsx watch` does not open a new
 * connection pool on every file save.
 */
export const prisma: PrismaClient = globalThis.__sbPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalThis.__sbPrisma = prisma;

export type Db = PrismaClient;
