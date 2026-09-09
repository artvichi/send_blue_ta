import type { Prisma } from '../../db/generated/client.js';
import type { EtaInput } from '@sb/shared';

/**
 * A scheduling policy decides *which* message leaves the queue next.
 *
 * It deliberately does not decide *whether* now is an allowed moment to send --
 * that is the rate limiter's job. Keeping the two apart is what lets the drain
 * rate change without touching ordering, and ordering change without touching
 * the rate limiter. Conflating them is what makes schedulers hard to modify.
 *
 * A policy contributes two SQL fragments to one shared claim query rather than
 * owning a query of its own, so every policy inherits the FOR UPDATE SKIP
 * LOCKED concurrency guarantee for free.
 */
export interface SchedulingPolicy {
  readonly name: string;

  /** Extra eligibility predicate, ANDed with `status = 'QUEUED'`. */
  eligibility(now: Date): Prisma.Sql;

  /** Ordering that decides which eligible message is at the head. */
  ordering(): Prisma.Sql;

  /** Projected send time for the message at 0-indexed queue `position`. */
  projectEta(position: number, input: EtaInput): Date;
}
