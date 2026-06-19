import { describe, expect, it } from 'vitest';

import { deriveDesktopAuthStatus } from '@/renderer/hooks/context/AuthContext';

// The desktop auth status used to be hard-coded 'authenticated' (a fail-OPEN lie
// that made the /login route a no-op). It is now derived from the Command EVE
// entitlement gate and must be HONEST + FAIL-CLOSED: only a confirmed entitled
// gate authenticates; everything else (and any missing/thrown response) does not.
describe('deriveDesktopAuthStatus — honest, fail-closed desktop auth gate', () => {
  it('authenticates ONLY a confirmed entitled gate', () => {
    expect(deriveDesktopAuthStatus({ data: { ok: true, state: 'entitled' } })).toBe('authenticated');
  });

  it.each([
    ['unregistered', { ok: false, state: 'unregistered' }],
    ['registered_unlicensed', { ok: false, state: 'registered_unlicensed' }],
    ['expired', { ok: false, state: 'expired' }],
    ['unconfigured', { ok: false, state: 'unconfigured' }],
  ])('reports unauthenticated for the non-entitled state %s', (_label, data) => {
    expect(deriveDesktopAuthStatus({ data })).toBe('unauthenticated');
  });

  it('does NOT authenticate on ok:true with a non-entitled state (no half-open)', () => {
    expect(deriveDesktopAuthStatus({ data: { ok: true, state: 'expired' } })).toBe('unauthenticated');
  });

  it('does NOT authenticate on state=entitled but ok:false', () => {
    expect(deriveDesktopAuthStatus({ data: { ok: false, state: 'entitled' } })).toBe('unauthenticated');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['no data key', {}],
    ['null data', { data: null }],
    ['empty data', { data: {} }],
  ])('fails CLOSED to unauthenticated for a missing/malformed response (%s)', (_label, res) => {
    expect(deriveDesktopAuthStatus(res as Parameters<typeof deriveDesktopAuthStatus>[0])).toBe('unauthenticated');
  });
});
