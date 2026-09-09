import { Prisma } from '../../db/generated/client.js';
import { projectEta, type EtaInput } from '@sb/shared';
import type { SchedulingPolicy } from './types.js';

/**
 * Send at or after a caller-supplied time, still rate limited, FIFO breaking ties.
 *
 * This is not wired into the product -- the mockup has no date picker and the
 * brief asks for FIFO. It exists because it is the extension most likely to be
 * asked about, and because demonstrating that the seam works costs about twenty
 * lines once `scheduledAt` exists on the model.
 *
 * Selecting it is a `Setting.policy` change, not a refactor.
 */
export const timestampedPolicy: SchedulingPolicy = {
  name: 'TIMESTAMPED',

  eligibility(now: Date) {
    // A null scheduledAt means "as soon as possible", so it is always eligible.
    return Prisma.sql`("scheduledAt" IS NULL OR "scheduledAt" <= ${now})`;
  },

  ordering() {
    return Prisma.sql`"forceDispatch" DESC, "scheduledAt" ASC NULLS FIRST, priority DESC, "queueSeq" ASC`;
  },

  projectEta(position: number, input: EtaInput) {
    // Rate limiting still applies, so a message cannot jump its slot merely by
    // asking for an earlier time.
    return projectEta(position, input);
  },
};
