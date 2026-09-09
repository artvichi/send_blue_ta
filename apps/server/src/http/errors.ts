/** An error that carries the HTTP status and machine-readable code it maps to. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Missing or invalid gateway token') =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'CONFLICT', message, details);
