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

import { afterEach, beforeEach, describe, it, expect } from 'vitest';

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

  it('uses official iOfficeAI OfficeCLI releases page', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
    expect(mod.OFFICECLI_INSTALL_URL).toBe('https://github.com/iOfficeAI/OfficeCLI/releases');
  });
});

/**
 * Issue #3212: in web (browser) mode the preview iframe URL must match the
 * backend proxy routes exactly. The backend registers /api/ppt-proxy/{port}
 * and /api/ppt-proxy/{port}/{*path} — a bare trailing slash matches neither
 * and returns 404, which breaks every Office preview in webui mode.
 */
const load = async () => {
  const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
  return mod.resolveOfficeWatchUrl;
};

describe('resolveOfficeWatchUrl (web mode, no window.electronAPI)', () => {
  // The dom setup stubs window.electronAPI globally; web mode is its absence.
  let electronApiStub: unknown;
  beforeEach(() => {
    const w = window as Window & { electronAPI?: unknown };
    electronApiStub = w.electronAPI;
    delete w.electronAPI;
  });
  afterEach(() => {
    (window as Window & { electronAPI?: unknown }).electronAPI = electronApiStub;
  });

  it('returns the backend proxy url without appending a trailing slash', async () => {
    const resolveOfficeWatchUrl = await load();
    expect(resolveOfficeWatchUrl('/api/ppt-proxy/59324', 'ppt')).toBe('/api/ppt-proxy/59324');
  });

  it('drops a bare trailing slash from the proxy url', async () => {
    const resolveOfficeWatchUrl = await load();
    expect(resolveOfficeWatchUrl('/api/office-watch-proxy/59324/', 'word')).toBe('/api/office-watch-proxy/59324');
  });

  it('keeps a real sub-path on the proxy url', async () => {
    const resolveOfficeWatchUrl = await load();
    expect(resolveOfficeWatchUrl('/api/office-watch-proxy/59324/index.html', 'excel')).toBe(
      '/api/office-watch-proxy/59324/index.html'
    );
  });

  it('maps an absolute localhost watch url to the proxy path without trailing slash', async () => {
    const resolveOfficeWatchUrl = await load();
    expect(resolveOfficeWatchUrl('http://127.0.0.1:59324', 'ppt')).toBe('/api/ppt-proxy/59324');
  });
});

describe('resolveOfficeWatchUrl (Electron mode)', () => {
  it('still resolves to the direct loopback url', async () => {
    // window.electronAPI is stubbed by the dom setup, so this is Electron mode.
    const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
    expect(mod.resolveOfficeWatchUrl('/api/ppt-proxy/59324', 'ppt')).toBe('http://127.0.0.1:59324/');
  });
});

/**
 * Web (server) deployments must not point users at a desktop install link:
 * officecli has to be installed on the machine running AionUi, so the error
 * panel shows a copyable server-side command instead (issue #3212 follow-up).
 */
describe('resolveOfficeErrorActions', () => {
  const load = async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer');
    return mod.resolveOfficeErrorActions;
  };

  it('web mode shows the server install guide when officecli is missing', async () => {
    const resolveOfficeErrorActions = await load();
    expect(resolveOfficeErrorActions('OFFICECLI_NOT_FOUND', false)).toEqual({
      showServerInstallGuide: true,
      showInstallLink: false,
      showRetry: true,
    });
  });

  it('web mode shows the server install guide when auto-install failed', async () => {
    const resolveOfficeErrorActions = await load();
    expect(resolveOfficeErrorActions('OFFICECLI_INSTALL_FAILED', false)).toEqual({
      showServerInstallGuide: true,
      showInstallLink: false,
      showRetry: true,
    });
  });

  it('electron mode keeps the local install link and never shows the server guide', async () => {
    const resolveOfficeErrorActions = await load();
    expect(resolveOfficeErrorActions('OFFICECLI_NOT_FOUND', true)).toEqual({
      showServerInstallGuide: false,
      showInstallLink: true,
      showRetry: true,
    });
  });

  it('timeout errors only offer retry', async () => {
    const resolveOfficeErrorActions = await load();
    expect(resolveOfficeErrorActions('OFFICECLI_PORT_TIMEOUT', false)).toEqual({
      showServerInstallGuide: false,
      showInstallLink: false,
      showRetry: true,
    });
  });

  it('non-recoverable errors offer no actions', async () => {
    const resolveOfficeErrorActions = await load();
    expect(resolveOfficeErrorActions('PATH_OUTSIDE_SANDBOX', false)).toEqual({
      showServerInstallGuide: false,
      showInstallLink: false,
      showRetry: false,
    });
  });
});
