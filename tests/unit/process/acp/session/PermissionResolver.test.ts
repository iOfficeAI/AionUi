// tests/unit/process/acp/session/PermissionResolver.test.ts

import { describe, it, expect, vi } from 'vitest';
import { PermissionResolver } from '@process/acp/session/PermissionResolver';

function makeRequest(toolName = 'read_file', callId = 'call-1') {
  return {
    sessionId: 'sess-1',
    toolCall: { id: callId, name: toolName },
    options: [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' as const },
      { optionId: 'deny', name: 'Deny', kind: 'reject_once' as const },
      { optionId: 'always', name: 'Always', kind: 'allow_always' as const },
    ],
    title: 'Read file',
    description: '/foo/bar.ts',
  };
}

describe('PermissionResolver', () => {
  it('auto-approves in YOLO mode', async () => {
    const resolver = new PermissionResolver({ autoApproveAll: true });
    const result = await resolver.evaluate(makeRequest(), vi.fn());
    expect(result.optionId).toBe('allow');
  });

  it('returns cached approval on second call', async () => {
    const resolver = new PermissionResolver({ autoApproveAll: false });
    const uiCallback = vi.fn();

    // First call: resolve manually
    const p1 = resolver.evaluate(makeRequest('read_file', 'c1'), uiCallback);
    resolver.resolve('c1', 'always');
    await p1;

    // Second call: should hit cache
    const uiCallback2 = vi.fn();
    const result = await resolver.evaluate(makeRequest('read_file', 'c2'), uiCallback2);
    expect(uiCallback2).not.toHaveBeenCalled();
    expect(result.optionId).toBe('always');
  });

  it('delegates to UI when no cache hit', async () => {
    const resolver = new PermissionResolver({ autoApproveAll: false });
    const uiCallback = vi.fn();
    const promise = resolver.evaluate(makeRequest('write_file', 'c1'), uiCallback);
    expect(uiCallback).toHaveBeenCalledOnce();
    resolver.resolve('c1', 'allow');
    const result = await promise;
    expect(result.optionId).toBe('allow');
  });

  it('hasPending is true during unresolved request (INV-S-10)', () => {
    const resolver = new PermissionResolver({ autoApproveAll: false });
    resolver.evaluate(makeRequest('tool', 'c1'), vi.fn());
    expect(resolver.hasPending).toBe(true);
  });

  it('rejectAll settles all pending promises (INV-X-04)', async () => {
    const resolver = new PermissionResolver({ autoApproveAll: false });
    const p1 = resolver.evaluate(makeRequest('a', 'c1'), vi.fn());
    const p2 = resolver.evaluate(makeRequest('b', 'c2'), vi.fn());
    resolver.rejectAll(new Error('disconnect'));
    await expect(p1).rejects.toThrow('disconnect');
    await expect(p2).rejects.toThrow('disconnect');
    expect(resolver.hasPending).toBe(false);
  });
});
