import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { unauthorized } from '../errors.js';

/** Constant-time compare so the token cannot be probed a byte at a time. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Guards every gateway endpoint. Without it, anyone who can reach the server
 * could drain the queue or report false delivery status.
 */
export const requireGatewayAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  const presented = header.slice('Bearer '.length).trim();
  if (!safeEqual(presented, env().GATEWAY_TOKEN)) return next(unauthorized());

  next();
};
