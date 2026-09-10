import { Prisma } from '../../db/generated/client.js';
import { projectEta, type EtaInput } from '@sb/shared';
import type { SchedulingPolicy } from './types.js';

/**
 * Send at or after a caller-supplied time, still rate limited, FIFO breaking
 * ties. Not wired into the product; it exists to prove the seam works, and
 * selecting it is a `Setting.policy` change rather than a refactor.
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
    // Rate limiting still applies: an earlier request does not jump the slot.
    return projectEta(position, input);
  },
};
