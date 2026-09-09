/**
 * Tests for startStaticServer port-conflict handling.
 *
 * When the user-facing port is already taken (e.g. a stale instance from a
 * previous crash), startStaticServer must fail with an actionable message
 * naming the port — not a raw EADDRINUSE — and must not leak its internal
 * loopback HTTP listener.
 */

import net from 'node:net';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startStaticServer } from '../src/static-server.js';

let blocker: net.Server;
let busyPort: number;

beforeAll(async () => {
  blocker = net.createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = blocker.address();
  if (!addr || typeof addr === 'string') throw new Error('blocker failed to bind');
  busyPort = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => blocker.close(() => resolve()));
});

describe('startStaticServer port conflict', () => {
  test('Throws an actionable error naming the busy port', async () => {
    await expect(
      startStaticServer({
        staticDir: '/tmp',
        backendPort: 1,
        port: busyPort,
      })
    ).rejects.toThrow(new RegExp(`Port ${busyPort} is already in use`));
  });

  test('Preserves the original EADDRINUSE error as cause', async () => {
    const err = await startStaticServer({
      staticDir: '/tmp',
      backendPort: 1,
      port: busyPort,
    }).then(
      () => null,
      (e: unknown) => e as Error
    );
    expect(err).toBeInstanceOf(Error);
    expect((err?.cause as NodeJS.ErrnoException | undefined)?.code).toBe('EADDRINUSE');
  });

  test('Rethrows non-EADDRINUSE bind errors unchanged', async () => {
    // An out-of-range port fails with ERR_SOCKET_BAD_PORT, exercising the
    // generic rethrow path: the original error must surface as-is (no wrapping).
    const err = await startStaticServer({
      staticDir: '/tmp',
      backendPort: 1,
      port: -1,
    }).then(
      () => null,
      (e: unknown) => e as NodeJS.ErrnoException
    );
    expect(err?.code).toBe('ERR_SOCKET_BAD_PORT');
    expect(err?.cause).toBeUndefined();
  });

  test('Does not leak the internal loopback listener after a bind failure', async () => {
    const settle = async (): Promise<void> => {
      // Give libuv a few turns to release handles closed during cleanup.
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    const countTcpServers = (): number => process.getActiveResourcesInfo().filter((r) => r === 'TCPServerWrap').length;

    // Warm-up failure so any lazily-created shared state exists before we snapshot.
    await startStaticServer({ staticDir: '/tmp', backendPort: 1, port: busyPort }).catch(() => undefined);
    await settle();
    const before = countTcpServers();

    // Repeated failures must not accumulate listeners: without cleanup each
    // attempt would leak one internal loopback HTTP server.
    for (let i = 0; i < 3; i++) {
      await startStaticServer({ staticDir: '/tmp', backendPort: 1, port: busyPort }).catch(() => undefined);
    }
    await settle();
    expect(countTcpServers()).toBeLessThanOrEqual(before);
  });
});
