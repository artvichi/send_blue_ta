import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/db/generated/client.js';

/**
 * Integration tests run against a real Postgres, because the properties under
 * test -- FOR UPDATE SKIP LOCKED, transactional status application, unique
 * constraints -- exist only in the database. A mocked client would assert
 * nothing about them.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run integration tests');
}

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE message_events, messages, gateway_heartbeats RESTART IDENTITY CASCADE',
  );
  await db.setting.deleteMany({});
}

export async function seedMessages(count: number, prefix = 'msg') {
  const created = [];
  for (let i = 0; i < count; i++) {
    created.push(
      await db.message.create({
        data: { toHandle: `+1206345600${i}`, body: `${prefix} ${i}` },
      }),
    );
  }
  return created;
}
