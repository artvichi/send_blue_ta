import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

/**
 * A deliberately tiny logger. The gateway is a single-purpose long-running
 * script; a structured logging framework would be more ceremony than it earns.
 *
 * Message bodies are never logged -- they are personal data, and the whole
 * point of this process is that it handles real texts to real people.
 */
function log(level: keyof typeof LEVELS, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[config().LOG_LEVEL]) return;
  const time = new Date().toISOString().slice(11, 19);
  const suffix = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
  const line = `[${time}] ${level.toUpperCase().padEnd(5)} ${msg}${suffix}`;
  if (level === 'error' || level === 'warn') console.error(line);
  else console.warn(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => log('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log('error', msg, fields),
};
