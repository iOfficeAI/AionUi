/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * N4c V8: OfficeWatchViewer export-shape smoke test.
 *
 * Design note:
 * OfficeWatchViewer mounts long-lived watch polling via useEffect. Rendering it
 * under jsdom (even with fully stubbed ipcBridge / Arco / WebviewHost) spins
 * setInterval/setTimeout cycles that don't settle inside worker-fork timeouts
 * and cause the vitest pool to hang (see plan §2.4 WS reconnect hazard).
 *
 * We therefore validate only the static module surface: exports, component
 * type, displayName-ish identity. Runtime render coverage for this file is
 * deferred to e2e (where the real watch backend is online) — this trade-off
 * is recorded in N4c-final.md Deviations.
 */

import { describe, it, expect } from 'vitest';

describe('OfficeWatchViewer module shape', () => {
  it('module loads and exposes a default export', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
    expect(mod).toBeDefined();
    expect(mod.default).toBeDefined();
  });

  it('default export is a function (React component)', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
    expect(typeof mod.default).toBe('function');
  });

  it('module exports object has no thrown side effects during import', async () => {
    // Importing the module a second time should use the cached copy and not throw.
    const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
    expect(mod.default).toBeDefined();
    // Component functions in React typically have at most one required argument (props).
    expect((mod.default as { length: number }).length).toBeLessThanOrEqual(2);
  });
});
