import { fifoPolicy } from './fifo.js';
import { timestampedPolicy } from './timestamped.js';
import type { SchedulingPolicy } from './types.js';

export type { SchedulingPolicy } from './types.js';
export { fifoPolicy, timestampedPolicy };

const POLICIES: Record<string, SchedulingPolicy> = {
  [fifoPolicy.name]: fifoPolicy,
  [timestampedPolicy.name]: timestampedPolicy,
};

export const DEFAULT_POLICY = fifoPolicy;

/** Resolve the configured policy, falling back to FIFO for an unknown name. */
export function resolvePolicy(name: string | undefined | null): SchedulingPolicy {
  if (!name) return DEFAULT_POLICY;
  return POLICIES[name] ?? DEFAULT_POLICY;
}

export function policyNames(): string[] {
  return Object.keys(POLICIES);
}
