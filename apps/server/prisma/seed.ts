/**
 * Seeds a few messages so the dashboard has something to show on a fresh
 * database. Safe to run repeatedly: it does nothing if messages already exist.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/db/generated/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SAMPLES = [
  { toHandle: '+15551234567', body: 'Hey! Just a reminder about our meeting tomorrow at 2 PM.' },
  { toHandle: '+15559876543', body: 'Your order has shipped and should arrive Thursday.' },
  { toHandle: '+12063456789', body: 'Following up on the notes from this morning -- all good?' },
];

async function main() {
  const existing = await prisma.message.count();
  if (existing > 0) {
    console.warn(`Database already has ${existing} messages; skipping seed.`);
    return;
  }

  for (const sample of SAMPLES) {
    const message = await prisma.message.create({ data: sample });
    await prisma.messageEvent.create({
      data: { messageId: message.id, status: 'QUEUED', occurredAt: message.createdAt },
    });
  }
  console.warn(`Seeded ${SAMPLES.length} queued messages.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
