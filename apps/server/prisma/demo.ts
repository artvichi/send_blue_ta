/**
 * `npm run db:demo` -- a week of realistic history for demos and screenshots.
 *
 * Writes finished messages only (delivered, read, failed, cancelled), never
 * queued ones: a real gateway would send those. Everything is timestamp-
 * consistent -- sent before delivered before read, events matching the row --
 * so the dashboard, the chart and the per-message timelines all agree.
 *
 * Idempotent per handle: re-running removes its own previous rows (they are
 * tagged in the event detail) and writes a fresh week ending now. Real
 * messages are never touched.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type MessageStatus } from '../src/db/generated/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const TAG = { source: 'demo' };
const DAYS = 7;

const RECIPIENTS = [
  { name: 'Maya Chen', handle: '+14155550142' },
  { name: 'Daniel Okafor', handle: '+12065550187' },
  { name: 'Priya Raman', handle: 'priya.raman@icloud.com' },
  { name: 'Lucas Moreau', handle: '+13105550163' },
  { name: 'Sofia Alvarez', handle: 'sofia.alvarez@me.com' },
  { name: 'Ethan Walsh', handle: '+16465550119' },
  { name: 'Hannah Kim', handle: '+15125550174' },
  { name: 'Omar Haddad', handle: 'omar.haddad@icloud.com' },
  { name: 'Grace Nakamura', handle: '+17735550128' },
  { name: 'Ben Fischer', handle: '+18025550151' },
];

const BODIES = [
  'Reminder: your appointment is tomorrow at {t}. Reply C to confirm.',
  'Your order #{n} has shipped and should arrive {d}.',
  'Thanks for today -- notes from the meeting are in the shared folder.',
  'Quick check-in: are we still on for {d} at {t}?',
  'Your table for 2 is confirmed for {d} at {t}. See you then!',
  'Invoice #{n} is ready. Let me know if anything looks off.',
  'Heads up: the office is closed {d}. Enjoy the long weekend.',
  'Package delivered to the front desk. Grab it when you are in.',
  'Following up on the proposal -- any questions before {d}?',
  'Your subscription renews on {d}. No action needed.',
  'Running about 10 minutes late, sorry! Grab us a seat?',
  'Happy birthday! Hope you have a great one.',
  'The draft is up for review. Comments by {d} would be perfect.',
  'Reminder: dentist at {t} {d}. Bring the insurance card.',
  'Your ride is booked for {t}. Driver details to follow.',
  'Great news -- the application went through. Congrats!',
];

const FAILURES = [
  'Messages reported error code 22',
  'osascript send failed: Messages got an error: Can’t get participant',
  'Sent via AppleScript but could not correlate the message in chat.db within 5s',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function body(i: number, at: Date): string {
  const t = `${8 + (i % 9)}:${i % 2 ? '30' : '00'} ${i % 9 > 3 ? 'PM' : 'AM'}`;
  const d = DAY_NAMES[(at.getDay() + 1 + (i % 3)) % 7]!;
  const n = 10400 + ((i * 37) % 900);
  return pick(BODIES, i * 7).replace('{t}', t).replace('{d}', d).replace('{n}', String(n));
}

/** A day's send slots: roughly hourly between 8am and 9pm, with some jitter. */
function slotsFor(day: Date, i: number): Date[] {
  const out: Date[] = [];
  const perDay = 11 + ((i * 7) % 4); // 11..14 sends a day
  for (let k = 0; k < perDay; k++) {
    const hour = 8 + Math.floor((k * 13) / perDay);
    const minute = (k * 17 + i * 11) % 60;
    const at = new Date(day);
    at.setHours(hour, minute, (k * 7) % 60, 0);
    out.push(at);
  }
  return out;
}

type Outcome = 'DELIVERED' | 'RECEIVED' | 'FAILED' | 'CANCELED' | 'SENT';

function outcomeFor(seq: number): Outcome {
  const r = (seq * 2654435761) % 100; // deterministic spread
  if (r < 62) return 'DELIVERED';
  if (r < 86) return 'RECEIVED';
  if (r < 94) return 'FAILED';
  if (r < 97) return 'CANCELED';
  return 'SENT';
}

async function main() {
  const removed = await prisma.message.deleteMany({
    where: { events: { some: { detail: { equals: TAG } } } },
  });
  if (removed.count) console.warn(`removed ${removed.count} previous demo messages`);

  for (const r of RECIPIENTS) {
    await prisma.recipient.upsert({
      where: { handle: r.handle },
      update: { name: r.name },
      create: r,
    });
  }

  const now = new Date();
  let seq = 0;
  let written = 0;

  for (let d = DAYS - 1; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(now.getDate() - d);
    day.setHours(0, 0, 0, 0);

    for (const dispatchedAt of slotsFor(day, d)) {
      if (dispatchedAt > now) continue;
      seq += 1;
      const recipient = pick(RECIPIENTS, seq * 3 + d);
      const outcome = outcomeFor(seq);
      const createdAt = new Date(dispatchedAt.getTime() - (5 + (seq % 50)) * 60_000);
      const acceptedAt = new Date(dispatchedAt.getTime() + 900);
      const sentAt = new Date(dispatchedAt.getTime() + 2_300 + (seq % 900));
      const deliveredAt = new Date(sentAt.getTime() + 1_500 + (seq % 25) * 1000);
      const receivedAt = new Date(deliveredAt.getTime() + (2 + (seq % 40)) * 60_000);
      const guid = `p:${randomUUID().toUpperCase()}`;

      const attempts = outcome === 'FAILED' ? 3 : outcome === 'CANCELED' ? 0 : 1 + (seq % 11 === 0 ? 1 : 0);
      const lastError = outcome === 'FAILED' ? pick(FAILURES, seq) : null;

      const events: { status: MessageStatus; occurredAt: Date }[] = [{ status: 'QUEUED', occurredAt: createdAt }];
      if (outcome === 'CANCELED') {
        events.push({ status: 'CANCELED', occurredAt: new Date(createdAt.getTime() + 3 * 60_000) });
      } else {
        events.push({ status: 'DISPATCHING', occurredAt: dispatchedAt });
        events.push({ status: 'ACCEPTED', occurredAt: acceptedAt });
        if (outcome === 'FAILED') {
          events.push({ status: 'FAILED', occurredAt: new Date(acceptedAt.getTime() + 4_000) });
        } else {
          events.push({ status: 'SENT', occurredAt: sentAt });
          if (outcome === 'DELIVERED' || outcome === 'RECEIVED') events.push({ status: 'DELIVERED', occurredAt: deliveredAt });
          if (outcome === 'RECEIVED') events.push({ status: 'RECEIVED', occurredAt: receivedAt });
        }
      }

      await prisma.message.create({
        data: {
          toHandle: recipient.handle,
          body: body(seq, dispatchedAt),
          status: outcome,
          attempts,
          lastError,
          createdAt,
          dispatchedAt: outcome === 'CANCELED' ? null : dispatchedAt,
          providerGuid: outcome === 'CANCELED' || outcome === 'FAILED' ? null : guid,
          sentAt: outcome === 'CANCELED' || outcome === 'FAILED' ? null : sentAt,
          deliveredAt: outcome === 'DELIVERED' || outcome === 'RECEIVED' ? deliveredAt : null,
          receivedAt: outcome === 'RECEIVED' ? receivedAt : null,
          events: {
            create: events.map((e, i) => ({
              status: e.status,
              occurredAt: e.occurredAt,
              recordedAt: new Date(e.occurredAt.getTime() + 400),
              // Tag exactly one event per message so a re-run can find its own rows.
              ...(i === 0 ? { detail: TAG } : {}),
            })),
          },
        },
      });
      written += 1;
    }
  }

  console.warn(`wrote ${written} demo messages across the last ${DAYS} days for ${RECIPIENTS.length} recipients`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
