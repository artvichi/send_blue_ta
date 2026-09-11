import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockDriver } from './mock.js';
import { createDriver } from './index.js';
import type { StatusEvent } from './types.js';

beforeEach(() => {
  process.env.GATEWAY_TOKEN = 'test-token';
  process.env.MOCK_STEP_MS = '5';
  process.env.MOCK_FAILURE_RATE = '0';
  vi.resetModules();
});

describe('mock driver', () => {
  it('reports a GUID that looks like a mock, never like a real chat.db GUID', async () => {
    const driver = createMockDriver();
    const result = await driver.send('+12063456789', 'hello');

    expect(result.providerGuid).toMatch(/^mock-/);
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it('reaches DELIVERED without any macOS permissions', async () => {
    const driver = createMockDriver();
    const events: StatusEvent[] = [];

    await new Promise<void>((resolve) => {
      driver.watch('mock-guid', (event) => {
        events.push(event);
        if (event.status === 'DELIVERED') resolve();
      });
    });

    expect(events.map((e) => e.status)).toContain('DELIVERED');
  });

  it('stops emitting once unsubscribed', async () => {
    const driver = createMockDriver();
    const events: StatusEvent[] = [];

    const unsubscribe = driver.watch('mock-guid', (event) => events.push(event));
    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events).toHaveLength(0);
  });

  it('fails on demand, so the unhappy path can be demonstrated', async () => {
    process.env.MOCK_FAILURE_RATE = '1';
    const { createMockDriver: freshDriver } = await import('./mock.js');
    vi.resetModules();

    // The config is memoized, so assert against a driver reading the new value.
    const driver = freshDriver();
    await expect(driver.send('+12063456789', 'hello')).rejects.toThrow(/simulated send failure/i);
  });
});

describe('createDriver', () => {
  it('refuses the applescript driver off macOS, naming the fix', () => {
    expect(() => createDriver('applescript', 'linux')).toThrow(/needs macOS.*GATEWAY_DRIVER=mock/s);
  });

  it('builds the mock driver on any platform', () => {
    expect(createDriver('mock', 'linux').name).toBe('mock');
  });
});
