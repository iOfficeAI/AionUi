// tests/unit/process/acp/session/ApprovalCache.test.ts

import { describe, it, expect } from 'vitest';
import { ApprovalCache } from '@process/acp/session/PermissionResolver';

describe('ApprovalCache', () => {
  it('stores and retrieves approvals by tool name', () => {
    const cache = new ApprovalCache(500);
    cache.set('read_file:/foo', 'allow_always');
    expect(cache.get('read_file:/foo')).toBe('allow_always');
  });

  it('returns undefined for unknown keys', () => {
    const cache = new ApprovalCache(500);
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('evicts oldest entry when exceeding maxSize (INV-S-13)', () => {
    const cache = new ApprovalCache(3);
    cache.set('a', 'allow_once');
    cache.set('b', 'allow_once');
    cache.set('c', 'allow_once');
    cache.set('d', 'allow_once'); // should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe('allow_once');
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it('refreshes LRU order on get', () => {
    const cache = new ApprovalCache(3);
    cache.set('a', 'allow_once');
    cache.set('b', 'allow_once');
    cache.set('c', 'allow_once');
    cache.get('a'); // refresh 'a', now 'b' is oldest
    cache.set('d', 'allow_once'); // should evict 'b'
    expect(cache.get('a')).toBe('allow_once');
    expect(cache.get('b')).toBeUndefined();
  });

  it('clear removes all entries', () => {
    const cache = new ApprovalCache(500);
    cache.set('a', 'allow_once');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('never exceeds maxSize (INV-S-13)', () => {
    const cache = new ApprovalCache(10);
    for (let i = 0; i < 100; i++) cache.set(`key-${i}`, 'allow_once');
    expect(cache.size).toBeLessThanOrEqual(10);
  });
});
