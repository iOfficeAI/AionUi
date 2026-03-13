import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalQueue } from '@/webserver/remote/ApprovalQueue';

describe('webserver/remote/ApprovalQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates approval with default ttl and resolves it', () => {
    const queue = new ApprovalQueue();
    const created = queue.create({
      userId: 'u1',
      title: 'Approve command',
      summary: 'Need confirmation',
      sessionId: 's1',
      payload: { cmd: 'rm -rf' },
    });

    expect(created.status).toBe('pending');
    expect(created.expiresAt - created.createdAt).toBe(5 * 60 * 1000);

    vi.setSystemTime(Date.now() + 1_000);

    const resolved = queue.resolve({
      userId: 'u1',
      approvalId: created.id,
      status: 'approved',
      resolvedByDeviceId: 'dev-1',
      resolvedByUsername: 'alice',
      resolutionNote: 'ok',
    });

    expect(resolved.status).toBe('approved');
    expect(resolved.resolvedByDeviceId).toBe('dev-1');
    expect(resolved.resolutionNote).toBe('ok');
    expect(resolved.updatedAt).toBe(Date.now());
  });

  it('rejects invalid resolve operations', () => {
    const queue = new ApprovalQueue();
    const created = queue.create({
      userId: 'u1',
      title: 'A',
      summary: 'B',
    });

    expect(() =>
      queue.resolve({
        userId: 'u2',
        approvalId: created.id,
        status: 'approved',
      })
    ).toThrow('Approval access denied');

    queue.resolve({
      userId: 'u1',
      approvalId: created.id,
      status: 'rejected',
    });

    expect(() =>
      queue.resolve({
        userId: 'u1',
        approvalId: created.id,
        status: 'approved',
      })
    ).toThrow('Approval already resolved');
  });

  it('expires stale pending approvals during list/query', () => {
    const queue = new ApprovalQueue();
    const created = queue.create({
      userId: 'u1',
      title: 'Short ttl',
      summary: 'expire soon',
      ttlMs: 500,
    });

    vi.setSystemTime(Date.now() + 501);

    const pending = queue.listByUser('u1', 'pending');
    expect(pending).toHaveLength(0);

    const all = queue.listByUser('u1');
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].status).toBe('expired');
  });
});
