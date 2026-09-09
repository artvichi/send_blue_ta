import type { Request } from 'express';
import { badRequest } from './errors.js';

/**
 * Read a path parameter as a string.
 *
 * Express 5 types params as `string | string[] | undefined` because a route can
 * declare a repeated parameter. Narrowing here -- once, with a real check --
 * keeps every handler free of casts and turns a malformed path into a 400
 * instead of an unhandled `undefined` further down.
 */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest(`Missing or invalid path parameter: ${name}`);
  }
  return value;
}
