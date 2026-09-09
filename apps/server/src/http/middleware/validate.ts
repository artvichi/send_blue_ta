import type { Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      /** Parsed query string, attached by `validateQuery`. */
      query?: unknown;
    }
  }
}

/** Field-level messages, shaped so a form can render them next to its inputs. */
function fieldErrors(error: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export const validateBody =
  <T>(schema: ZodType<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest('Request body is not valid', fieldErrors(result.error)));
    }
    // Replaced with the parsed value so handlers see coerced, trimmed types.
    req.body = result.data;
    next();
  };

/**
 * Express 5 exposes `req.query` through a getter with no setter, so the parsed
 * value is attached to `res.locals` instead of assigned back over the original.
 */
export const validateQuery =
  <T>(schema: ZodType<T>): RequestHandler =>
  (req: Request, res: Response, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(badRequest('Query parameters are not valid', fieldErrors(result.error)));
    }
    res.locals.query = result.data;
    next();
  };

/** Read the value attached by `validateQuery`. */
export function validatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
