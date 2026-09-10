import type { Prisma } from '../../db/generated/client.js';
import type { EtaInput } from '@sb/shared';

/**
 * Decides *which* message leaves next -- never *whether* now is allowed, which
 * is the rate limiter's job. Conflating the two is what makes schedulers hard to
 * change.
 *
 * A policy contributes SQL fragments to one shared claim query rather than
 * owning a query, so every policy inherits SKIP LOCKED for free.
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
