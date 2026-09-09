import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../errors.js';
import { logger } from '../../config/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
};

/**
 * The single place an error becomes a response. Handlers throw; they never
 * shape their own error payloads, so the format cannot drift between routes.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.status >= 500) logger.error({ err }, 'request failed');
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our end' },
  });
};

/** Wrap an async handler so a rejected promise reaches the error handler. */
export const asyncRoute =
  <T extends RequestHandler>(handler: T): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
