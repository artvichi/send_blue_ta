import pino from 'pino';
import { env } from './env.js';

/**
 * Message bodies are personal data. They are never logged -- not at debug, not
 * in an error path. Everything logged about a message refers to it by id.
 */
export const logger = pino({
  level: env().LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'body', '*.body', 'message.body'],
    remove: true,
  },
  ...(env().NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
});

export type Logger = typeof logger;
