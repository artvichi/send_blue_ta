import { describe, it, expect } from 'vitest';
import { loadConfig, VERSION } from './config.js';

const base = { GATEWAY_TOKEN: 'secret' };

describe('gateway config', () => {
  it('defaults to the mock driver, so a fresh checkout never texts anyone', () => {
    expect(loadConfig(base).GATEWAY_DRIVER).toBe('mock');
  });

  it('refuses to start without a token, naming the variable', () => {
    expect(() => loadConfig({})).toThrow(/GATEWAY_TOKEN/);
  });

  it('rejects an unknown driver rather than silently falling back', () => {
    expect(() => loadConfig({ ...base, GATEWAY_DRIVER: 'carrier-pigeon' })).toThrow(
      /GATEWAY_DRIVER/,
    );
  });

  it('caps the long-poll wait so a proxy cannot time it out', () => {
    expect(() => loadConfig({ ...base, GATEWAY_POLL_WAIT_SECONDS: '120' })).toThrow();
    expect(loadConfig({ ...base, GATEWAY_POLL_WAIT_SECONDS: '10' }).GATEWAY_POLL_WAIT_SECONDS).toBe(10);
  });

  it('coerces numeric strings from the environment', () => {
    expect(loadConfig({ ...base, HEARTBEAT_INTERVAL_MS: '5000' }).HEARTBEAT_INTERVAL_MS).toBe(5000);
  });

  it('reports the version from the package manifest', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
