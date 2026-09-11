import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeaseDto } from '@sb/shared';
import type { MessageDriver, StatusEvent } from '../drivers/types.js';
import type { StatusReport } from '../server/client.js';
import { handleLease } from './lease.js';
import { createWatchers } from './watchers.js';

vi.mock('../config.js', () => ({
  config: () => ({ LOG_LEVEL: 'error' }),
}));

const lease = (overrides: Partial<LeaseDto> = {}): LeaseDto => ({
  messageId: 'msg-1',
  dispatchToken: 'tok-1',
  to: '+12063456789',
  body: 'hello',
  leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  providerGuid: null,
  ...overrides,
});

function fakeDriver(send: MessageDriver['send']): MessageDriver & { watched: string[] } {
  const watched: string[] = [];
  return {
    name: 'fake',
    watched,
    capabilities: async () => ({ ready: true, fullDiskAccess: null, automation: null, hostApp: null }),
    send,
    watch(guid) {
      watched.push(guid);
      return () => undefined;
    },
  };
}

let reports: StatusReport[];
const reportStatus = async (r: StatusReport) => {
  reports.push(r);
};

beforeEach(() => {
  reports = [];
});

describe('handleLease', () => {
  it('acknowledges, sends, records the GUID with ACCEPTED, then watches', async () => {
    const send = vi.fn(async () => ({ providerGuid: 'guid-1', sentAt: new Date('2026-01-01') }));
    const driver = fakeDriver(send);
    const watchers = createWatchers(driver, reportStatus);

    await handleLease(lease(), { driver, reportStatus, watchers });

    expect(send).toHaveBeenCalledWith('+12063456789', 'hello');
    expect(reports.map((r) => r.status)).toEqual(['ACCEPTED', 'ACCEPTED']);
    // The GUID is persisted the instant the message exists -- it is the
    // double-send guard, and SENT is left to the watcher.
    expect(reports[1]?.providerGuid).toBe('guid-1');
    expect(reports[1]?.occurredAt).toEqual(new Date('2026-01-01'));
    expect(driver.watched).toEqual(['guid-1']);
    expect(watchers.size).toBe(1);
  });

  it('never calls the driver again when the lease already carries a GUID', async () => {
    const send = vi.fn(async () => {
      throw new Error('must not be called');
    });
    const driver = fakeDriver(send);
    const watchers = createWatchers(driver, reportStatus);

    await handleLease(lease({ providerGuid: 'guid-previous' }), {
      driver,
      reportStatus,
      watchers,
    });

    // This is the double-send guard from the gateway's side: a reaped lease
    // whose first attempt did send must re-attach, not re-text the person.
    expect(send).not.toHaveBeenCalled();
    expect(reports.map((r) => r.status)).toEqual(['ACCEPTED', 'SENT']);
    expect(reports[1]?.providerGuid).toBe('guid-previous');
    expect(driver.watched).toEqual(['guid-previous']);
  });

  it('reports FAILED with the driver error and records no GUID', async () => {
    const driver = fakeDriver(async () => {
      throw new Error('osascript send failed: -1743');
    });
    const watchers = createWatchers(driver, reportStatus);

    await handleLease(lease(), { driver, reportStatus, watchers });

    expect(reports.map((r) => r.status)).toEqual(['ACCEPTED', 'FAILED']);
    expect(reports[1]?.error).toBe('osascript send failed: -1743');
    expect(reports[1]?.providerGuid).toBeUndefined();
    expect(watchers.size).toBe(0);
  });

  it('carries the dispatch token on every report, so a stale attempt can be rejected', async () => {
    const driver = fakeDriver(async () => ({ providerGuid: 'g', sentAt: new Date() }));
    const watchers = createWatchers(driver, reportStatus);

    await handleLease(lease({ dispatchToken: 'tok-42' }), { driver, reportStatus, watchers });

    expect(reports.every((r) => r.dispatchToken === 'tok-42')).toBe(true);
  });
});

describe('createWatchers', () => {
  function emittingDriver(): MessageDriver & { emit: (e: StatusEvent) => void; cancelled: number } {
    let handler: ((e: StatusEvent) => void) | null = null;
    const driver = {
      name: 'emitting',
      cancelled: 0,
      capabilities: async () => ({ ready: true, fullDiskAccess: null, automation: null, hostApp: null }),
      send: async () => ({ providerGuid: 'g', sentAt: new Date() }),
      watch(_guid: string, onStatus: (e: StatusEvent) => void) {
        handler = onStatus;
        return () => {
          driver.cancelled += 1;
        };
      },
      emit(e: StatusEvent) {
        handler?.(e);
      },
    };
    return driver;
  }

  it('forwards watched events as status reports for the right message', async () => {
    const driver = emittingDriver();
    const watchers = createWatchers(driver, reportStatus);
    watchers.watch(lease({ messageId: 'm-7', dispatchToken: 't-7' }), 'guid-7');

    const at = new Date('2026-02-02');
    driver.emit({ status: 'DELIVERED', occurredAt: at });
    await Promise.resolve();

    expect(reports).toEqual([
      { messageId: 'm-7', dispatchToken: 't-7', status: 'DELIVERED', occurredAt: at },
    ]);
    expect(watchers.size).toBe(1);
  });

  it('sends one message\'s reports in the order observed, never concurrently', async () => {
    const driver = emittingDriver();
    const started: string[] = [];
    const finished: string[] = [];
    let release!: () => void;
    const slowReport = (r: StatusReport) =>
      new Promise<void>((resolve) => {
        started.push(r.status);
        release = () => {
          finished.push(r.status);
          resolve();
        };
      });
    const watchers = createWatchers(driver, slowReport);
    watchers.watch(lease(), 'g');

    // A single poll that saw delivered and read at once.
    driver.emit({ status: 'DELIVERED', occurredAt: new Date() });
    driver.emit({ status: 'RECEIVED', occurredAt: new Date() });
    await Promise.resolve();

    expect(started).toEqual(['DELIVERED']); // RECEIVED waits its turn
    release();
    await new Promise((r) => setTimeout(r, 0)); // let the chain advance
    expect(started).toEqual(['DELIVERED', 'RECEIVED']);
    expect(finished).toEqual(['DELIVERED']);
  });

  it('releases the watcher on a terminal event, and keeps it on DELIVERED', async () => {
    const driver = emittingDriver();
    const watchers = createWatchers(driver, reportStatus);
    watchers.watch(lease(), 'g');

    driver.emit({ status: 'DELIVERED', occurredAt: new Date() });
    expect(driver.cancelled).toBe(0);

    driver.emit({ status: 'RECEIVED', occurredAt: new Date() });
    expect(driver.cancelled).toBe(1);
    expect(watchers.size).toBe(0);
  });

  it('cancels everything on stopAll', () => {
    const driver = emittingDriver();
    const watchers = createWatchers(driver, reportStatus);
    watchers.watch(lease({ messageId: 'a' }), 'g1');
    watchers.watch(lease({ messageId: 'b' }), 'g2');

    watchers.stopAll();

    expect(driver.cancelled).toBe(2);
    expect(watchers.size).toBe(0);
  });
});
