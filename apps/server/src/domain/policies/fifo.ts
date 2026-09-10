import { Prisma } from '../../db/generated/client.js';
import { projectEta, type EtaInput } from '@sb/shared';
import type { SchedulingPolicy } from './types.js';

/**
 * Ordered by `queueSeq`, not `createdAt`: two messages created in the same
 * millisecond would tie, and a tie in a FIFO queue is a bug.
 */
export const fifoPolicy: SchedulingPolicy = {
  name: 'FIFO',

  eligibility() {
    return Prisma.sql`TRUE`;
  },

  ordering() {
    // A "send now" override jumps the queue; everything else is strict FIFO.
    return Prisma.sql`"forceDispatch" DESC, "queueSeq" ASC`;
  },

  projectEta(position: number, input: EtaInput) {
    return projectEta(position, input);
  },
};
