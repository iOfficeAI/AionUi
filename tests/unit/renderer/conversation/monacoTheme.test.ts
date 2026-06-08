/**
 * @license
 * Copyright 2025 AionUi (aionUi.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the defensive theme handling in `monacoTheme.ts`. After
 * `MonacoVscodeApiWrapper.start()` succeeds the workbench theme service
 * may be bound to `IStandaloneThemeService` and not expose `defineTheme`.
 * These tests cover all the code paths:
 *
 *   1. `defineTheme` workbench override in place (probe detects missing
 *      `defineTheme`). The SUT just sets the matching built-in base
 *      theme (`vs` / `vs-dark`) via `monaco.editor.setTheme(base)` —
 *      the custom `aionui-light` / `aionui-dark` themes are NOT
 *      registered in the workbench path (they wouldn't be reachable
 *      anyway), and the actual color customization is applied by the
 *      separate `applyTheme(mode)` helper.
 *   2. `defineTheme` standalone path, runtime `defineTheme` throws —
 *      the try/catch safety net downgrades to `setTheme(base)`.
 *   3. `defineTheme` standalone happy path — both light + dark themes
 *      get defined and the configuration service is never touched.
 *   4. `applyTheme` workbench path, success — synchronously sets the
 *      base theme and asynchronously writes the user config with
 *      `workbench.colorCustomizations` / `workbench.colorTheme`.
 *   5. `applyTheme` workbench path, write rejects — falls back to the
 *      base theme that was already set synchronously.
 *   6. `applyTheme` standalone path — switches to the registered aionui
 *      theme and never touches the configuration service.
 *   7. `initialThemeFor` returns the right name for each path so the
 *      editor's `theme` create option never mounts with a name the
 *      workbench registry doesn't have (the user-visible
 *      "white background" bug).
 *   8. `themeNameFor` regression and `ensureAionuiThemesRegistered`
 *      idempotency.
 *
 * Why the workbench config write moved out of `defineTheme`:
 *   The previous design wrote `workbench.colorCustomizations` once per
 *   `defineTheme` call (light + dark). The two writes raced because
 *   `ensureAionuiThemesRegistered` fires both, and
 *   `updateUserConfiguration` is a full-file read-modify-write. The
 *   second call clobbered the first, leaving only one mode's palette
 *   in the user config. The new design centralizes the write inside
 *   `applyTheme(mode)`, which is called exactly once per mode change.
 *
 * Note on mocking the dynamic import: `vi.mock` (hoisted) is unreliable for
 * a dynamic `import()` that runs after `vi.resetModules()` — the registry
 * gets cleared and the real module loads, which then crashes on a CSS
 * extension in the Node test env. The robust pattern is `vi.doMock` AFTER
 * `vi.resetModules()` and BEFORE the SUT import; we also exercise the
 * "real import fails" path explicitly so the test suite covers both the
 * happy fallback and the import-failure safety net.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared, mutable mock state. Mutated in `beforeEach` so each test sees a
// clean SUT module + a controlled service-lookup result.
const state = vi.hoisted(() => {
  const defineThemeMock = vi.fn();
  const setThemeMock = vi.fn();
  const themeServiceId = { __brand: 'IStandaloneThemeService' };
  const getUserConfigurationMock = vi.fn();
  const updateUserConfigurationMock = vi.fn();
  return {
    defineThemeMock,
    setThemeMock,
    themeServiceId,
    getUserConfigurationMock,
    updateUserConfigurationMock,
    // What the probe sees: an object with arbitrary shape. `null` makes
    // the probe give up (no service bound yet), letting the unguarded
    // `monaco.editor.defineTheme` call run.
    probeService: null as { defineTheme?: unknown } | null,
    // Number of times the probe was called (for assertion).
    probeCalls: 0,
    // Simulate the file-system state for the configuration-service override.
    currentUserConfigJson: '' as string,
    // Whether `updateUserConfiguration` should throw (used to exercise the
    // inner try/catch safety net in the SUT).
    updateShouldThrow: false,
    // Whether the dynamic import of the configuration-service-override
    // module should reject (used to exercise the "module unavailable"
    // path in `applyTheme`).
    importShouldThrow: false,
  };
});

vi.mock('@aionui/editor-monaco', () => ({
  editor: {
    defineTheme: (...args: unknown[]) => state.defineThemeMock(...args),
    setTheme: (...args: unknown[]) => state.setThemeMock(...args),
  },
}));

vi.mock('@codingame/monaco-vscode-api/services', () => ({
  StandaloneServices: {
    get: (id: unknown) => {
      if (id === state.themeServiceId) state.probeCalls++;
      return state.probeService ?? undefined;
    },
  },
}));

vi.mock('@codingame/monaco-vscode-api/vscode/vs/editor/standalone/common/standaloneTheme.service', () => ({
  IStandaloneThemeService: state.themeServiceId,
}));

// `monacoTheme` calls `getComputedStyle(document.documentElement)` for every
// CSS-var lookup. Stub it so the Node test env doesn't crash.
if (typeof globalThis.document === 'undefined') {
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement: {} },
    configurable: true,
  });
}
if (typeof globalThis.getComputedStyle === 'undefined') {
  Object.defineProperty(globalThis, 'getComputedStyle', {
    value: () => ({ getPropertyValue: () => '' }),
    configurable: true,
  });
}

type ThemeModule = typeof import('@/renderer/pages/conversation/Editor/monacoTheme');
let themeMod: ThemeModule;

// Drain the microtask queue so the fire-and-forget async work inside
// `applyTheme` (and the formerly-IIFE in `defineTheme`) settles before
// assertions run. There are several `await import(...)` / `await
// getUserConfiguration()` / `await updateUserConfiguration(...)` calls;
// the `await import` can resolve on a macrotask (setImmediate /
// setTimeout 0), so we wait for a few macrotask ticks AND a few
// microtask drains.
const flushAsync = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('monacoTheme defensive registration', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    state.defineThemeMock.mockReset();
    state.setThemeMock.mockReset();
    state.getUserConfigurationMock.mockReset();
    state.updateUserConfigurationMock.mockReset();
    state.probeCalls = 0;
    state.probeService = null;
    state.currentUserConfigJson = '';
    state.updateShouldThrow = false;
    state.importShouldThrow = false;
    // Default behavior: get returns the empty string (no prior settings),
    // update resolves successfully and records the JSON it was called with.
    state.getUserConfigurationMock.mockImplementation(() => Promise.resolve(state.currentUserConfigJson));
    state.updateUserConfigurationMock.mockImplementation((json: string) => {
      if (state.updateShouldThrow) return Promise.reject(new Error('simulated update failure'));
      state.currentUserConfigJson = json;
      return Promise.resolve();
    });
    // Reset the module-level `themesRegistered` guard so each test gets a
    // fresh SUT instance. Re-register the dynamic-import mock AFTER
    // `vi.resetModules()` so it's applied to the SUT's fresh import.
    vi.resetModules();
    vi.doMock('@codingame/monaco-vscode-configuration-service-override', () => {
      // Throwing from the factory makes the SUT's `await import(...)`
      // reject — this is the "module can't be loaded" path (renamed
      // export, CSS extension in the Node test env, etc.), not the
      // "module loaded but a function inside it rejected" path.
      if (state.importShouldThrow) {
        throw new Error('simulated import failure');
      }
      return {
        getUserConfiguration: () => state.getUserConfigurationMock(),
        updateUserConfiguration: (json: string) => state.updateUserConfigurationMock(json),
      };
    });
    themeMod = await import('@/renderer/pages/conversation/Editor/monacoTheme');
    // Spy AFTER the import so the spy is wired against the same `console`
    // global the SUT is using.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('sets the base theme in the workbench path (defineTheme does not write user config)', async () => {
    // Workbench service bound: the probe returns true. The new design
    // intentionally stops writing `workbench.colorCustomizations` from
    // `defineTheme` (the old design raced and clobbered itself across
    // the light + dark calls). Instead `defineTheme` just sets the
    // built-in base theme (`vs` / `vs-dark`) via `setTheme` so the
    // editor has a valid color scheme before `applyTheme` writes the
    // actual palette.
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };

    themeMod.ensureAionuiThemesRegistered();
    await flushAsync();

    expect(state.probeCalls).toBeGreaterThan(0);
    // The probe path must NOT have used Monaco's `defineTheme`.
    expect(state.defineThemeMock).not.toHaveBeenCalled();
    // The workbench fallback sets the base theme synchronously for
    // both registrations.
    expect(state.setThemeMock).toHaveBeenCalledWith('vs');
    expect(state.setThemeMock).toHaveBeenCalledWith('vs-dark');
    // The configuration service is NOT touched by `defineTheme` in the
    // workbench path anymore — the write moved to `applyTheme` to
    // eliminate the per-theme race.
    expect(state.updateUserConfigurationMock).not.toHaveBeenCalled();
    expect(state.getUserConfigurationMock).not.toHaveBeenCalled();
  });

  it('falls back to setTheme(base) when monaco.editor.defineTheme throws at runtime', () => {
    // Probe path returns false (looks like a happy stand-alone service),
    // but the real defineTheme call throws. The try/catch safety net
    // must downgrade to setTheme.
    state.probeService = { defineTheme: () => undefined };
    state.defineThemeMock.mockImplementation(() => {
      throw new TypeError('standaloneThemeService.defineTheme is not a function');
    });

    themeMod.ensureAionuiThemesRegistered();

    expect(state.defineThemeMock).toHaveBeenCalled();
    // At least one of the two setTheme calls must have fired (the runtime
    // safety net for the light or the dark theme).
    expect(state.setThemeMock).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('threw'), expect.anything());
  });

  it('uses monaco.editor.defineTheme on the happy path and never falls back', () => {
    state.probeService = { defineTheme: () => undefined };
    state.defineThemeMock.mockImplementation(() => undefined);

    themeMod.ensureAionuiThemesRegistered();

    // Both light and dark themes get defined; the fallback path is unused.
    expect(state.defineThemeMock).toHaveBeenCalledTimes(2);
    expect(state.setThemeMock).not.toHaveBeenCalled();
    // The happy path must NOT touch the configuration service.
    expect(state.updateUserConfigurationMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns the same theme name for a given mode (regression)', () => {
    expect(themeMod.themeNameFor('light')).toBe('aionui-light');
    expect(themeMod.themeNameFor('dark')).toBe('aionui-dark');
  });

  it('is idempotent: repeated calls do not re-register', () => {
    state.probeService = { defineTheme: () => undefined };
    state.defineThemeMock.mockImplementation(() => undefined);

    themeMod.ensureAionuiThemesRegistered();
    themeMod.ensureAionuiThemesRegistered();
    themeMod.ensureAionuiThemesRegistered();

    // The `themesRegistered` guard still holds across the new defensive
    // try/catch: registration happens at most once per process.
    expect(state.defineThemeMock).toHaveBeenCalledTimes(2);
  });
});

describe('applyTheme (mode-driven palette apply)', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    state.defineThemeMock.mockReset();
    state.setThemeMock.mockReset();
    state.getUserConfigurationMock.mockReset();
    state.updateUserConfigurationMock.mockReset();
    state.probeCalls = 0;
    state.probeService = null;
    state.currentUserConfigJson = '';
    state.updateShouldThrow = false;
    state.importShouldThrow = false;
    state.getUserConfigurationMock.mockImplementation(() => Promise.resolve(state.currentUserConfigJson));
    state.updateUserConfigurationMock.mockImplementation((json: string) => {
      if (state.updateShouldThrow) return Promise.reject(new Error('simulated update failure'));
      state.currentUserConfigJson = json;
      return Promise.resolve();
    });
    vi.resetModules();
    vi.doMock('@codingame/monaco-vscode-configuration-service-override', () => {
      if (state.importShouldThrow) {
        throw new Error('simulated import failure');
      }
      return {
        getUserConfiguration: () => state.getUserConfigurationMock(),
        updateUserConfiguration: (json: string) => state.updateUserConfigurationMock(json),
      };
    });
    themeMod = await import('@/renderer/pages/conversation/Editor/monacoTheme');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('sets the aionui theme on the standalone path and never touches the configuration service', async () => {
    // Standalone probe state — `defineTheme` is available, so the
    // aionui custom themes are registered. `applyTheme` just needs to
    // switch the active theme; no user config write is necessary.
    state.probeService = { defineTheme: () => undefined };

    await themeMod.applyTheme('dark');
    await flushAsync();

    expect(state.setThemeMock).toHaveBeenCalledWith('aionui-dark');
    expect(state.updateUserConfigurationMock).not.toHaveBeenCalled();
    expect(state.getUserConfigurationMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    state.setThemeMock.mockReset();
    await themeMod.applyTheme('light');
    await flushAsync();
    expect(state.setThemeMock).toHaveBeenCalledWith('aionui-light');
  });

  it('writes workbench.colorCustomizations + workbench.colorTheme on the workbench path', async () => {
    // The user-reported "white background" fix: when the workbench
    // theme service is in scope, `applyTheme` writes the palette to
    // user config and sets the matching base theme synchronously.
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };
    // Simulate the user settings file already containing the editor prefs
    // configured in `monacoVscodeApiInit.ts` so we can verify they are
    // preserved across the `updateUserConfiguration` write.
    state.currentUserConfigJson = JSON.stringify({
      'editor.wordBasedSuggestions': 'off',
      'editor.quickSuggestions': { other: true, comments: false, strings: true },
    });

    await themeMod.applyTheme('dark');
    await flushAsync();

    // Synchronous base-theme set so the editor mounts with a valid
    // color scheme even before the async config write completes.
    expect(state.setThemeMock).toHaveBeenCalledWith('vs-dark');
    // Exactly one user-config write per `applyTheme` call (no race
    // between light and dark like the old design).
    expect(state.getUserConfigurationMock).toHaveBeenCalledTimes(1);
    expect(state.updateUserConfigurationMock).toHaveBeenCalledTimes(1);
    // The single payload carries the dark-mode keys.
    const [jsonArg] = state.updateUserConfigurationMock.mock.calls[0] as [string];
    const parsed = JSON.parse(jsonArg) as Record<string, unknown>;
    // Existing settings preserved.
    expect(parsed['editor.wordBasedSuggestions']).toBe('off');
    expect(parsed['editor.quickSuggestions']).toEqual({ other: true, comments: false, strings: true });
    // The colorCustomizations + colorTheme keys are present with the
    // expected values.
    expect(parsed['workbench.colorTheme']).toBe('vs-dark');
    const colors = parsed['workbench.colorCustomizations'] as Record<string, string>;
    expect(colors['editor.background']).toBeTypeOf('string');
    expect(colors['editor.background']).not.toBe('');
    expect(colors['editor.foreground']).toBeTypeOf('string');
    expect(colors['minimap.background']).toBeTypeOf('string');
    // The empty `textMateRules` mirror is present so the two
    // configuration surfaces stay aligned with the Monaco happy path.
    expect(parsed['editor.tokenColorCustomizations']).toEqual({ textMateRules: [] });
    // No warnings in the happy fallback path.
    expect(warn).not.toHaveBeenCalled();
  });

  it('writes light-mode keys when applyTheme is called for light', async () => {
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };
    state.currentUserConfigJson = JSON.stringify({ 'editor.wordBasedSuggestions': 'off' });

    await themeMod.applyTheme('light');
    await flushAsync();

    expect(state.setThemeMock).toHaveBeenCalledWith('vs');
    const [jsonArg] = state.updateUserConfigurationMock.mock.calls[0] as [string];
    const parsed = JSON.parse(jsonArg) as Record<string, unknown>;
    expect(parsed['workbench.colorTheme']).toBe('vs');
    expect(parsed['editor.wordBasedSuggestions']).toBe('off');
  });

  it('falls back to the base theme when updateUserConfiguration rejects', async () => {
    // The synchronous `safeSetTheme(base)` already mounted the editor
    // with a valid base. If the configuration-service write fails,
    // `applyTheme` must log and return without re-throwing.
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };
    state.updateShouldThrow = true;

    await themeMod.applyTheme('dark');
    await flushAsync();

    expect(state.setThemeMock).toHaveBeenCalledWith('vs-dark');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('updateUserConfiguration failed'), expect.anything());
  });

  it('falls back to the base theme when the configuration-service module import fails', async () => {
    // The dynamic import inside `applyTheme` rejects. The synchronous
    // `safeSetTheme(base)` already mounted the editor, so the editor
    // still has a valid color scheme even though the palette write
    // never happened.
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };
    state.importShouldThrow = true;

    await themeMod.applyTheme('dark');
    await flushAsync();

    expect(state.setThemeMock).toHaveBeenCalledWith('vs-dark');
    expect(state.updateUserConfigurationMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('updateUserConfiguration failed'), expect.anything());
  });

  it('overwrites the previous workbench.colorCustomizations on a second applyTheme call (no race)', async () => {
    // The original bug: the second of two `defineTheme` calls
    // (light + dark) clobbered the first, leaving the editor with the
    // wrong palette. With `applyTheme` called once per mode change,
    // the second call replaces the first cleanly because each call is
    // a single read-modify-write. Verify both payloads carry the
    // correct mode's `workbench.colorTheme`.
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };

    await themeMod.applyTheme('light');
    await flushAsync();
    const [lightJson] = state.updateUserConfigurationMock.mock.calls[0] as [string];
    expect(JSON.parse(lightJson)['workbench.colorTheme']).toBe('vs');

    // Reset only the call records; keep `currentUserConfigJson` so
    // the second call sees the result of the first.
    state.updateUserConfigurationMock.mockClear();
    state.setThemeMock.mockClear();

    await themeMod.applyTheme('dark');
    await flushAsync();
    const [darkJson] = state.updateUserConfigurationMock.mock.calls[0] as [string];
    expect(JSON.parse(darkJson)['workbench.colorTheme']).toBe('vs-dark');
    // The base theme was also re-set synchronously on the second call.
    expect(state.setThemeMock).toHaveBeenCalledWith('vs-dark');
  });
});

describe('initialThemeFor (editor create option)', () => {
  beforeEach(() => {
    state.defineThemeMock.mockReset();
    state.setThemeMock.mockReset();
    state.getUserConfigurationMock.mockReset();
    state.updateUserConfigurationMock.mockReset();
    state.probeCalls = 0;
    state.probeService = null;
    state.currentUserConfigJson = '';
    state.updateShouldThrow = false;
    state.importShouldThrow = false;
    state.getUserConfigurationMock.mockImplementation(() => Promise.resolve(state.currentUserConfigJson));
    state.updateUserConfigurationMock.mockImplementation((json: string) => {
      if (state.updateShouldThrow) return Promise.reject(new Error('simulated update failure'));
      state.currentUserConfigJson = json;
      return Promise.resolve();
    });
  });

  it('returns the registered aionui theme name on the standalone path', async () => {
    vi.resetModules();
    vi.doMock('@codingame/monaco-vscode-configuration-service-override', () => ({
      getUserConfiguration: () => state.getUserConfigurationMock(),
      updateUserConfiguration: (json: string) => state.updateUserConfigurationMock(json),
    }));
    // Standalone probe state — `defineTheme` is available, so the
    // aionui custom themes are registered with Monaco.
    state.probeService = { defineTheme: () => undefined };
    const mod = await import('@/renderer/pages/conversation/Editor/monacoTheme');
    expect(mod.initialThemeFor('light')).toBe('aionui-light');
    expect(mod.initialThemeFor('dark')).toBe('aionui-dark');
  });

  it('returns the built-in base theme on the workbench path (avoids the white-flash bug)', async () => {
    vi.resetModules();
    vi.doMock('@codingame/monaco-vscode-configuration-service-override', () => ({
      getUserConfiguration: () => state.getUserConfigurationMock(),
      updateUserConfiguration: (json: string) => state.updateUserConfigurationMock(json),
    }));
    // Workbench probe state — `defineTheme` is missing, so the aionui
    // custom themes are NOT registered. Passing `aionui-light` to
    // `monaco.editor.create({ theme })` would mount the editor with
    // the default white `vs` surface — the user-reported bug. The
    // helper must return the built-in base instead.
    state.probeService = { __svc: 'workbench' } as unknown as { defineTheme?: unknown };
    const mod = await import('@/renderer/pages/conversation/Editor/monacoTheme');
    expect(mod.initialThemeFor('light')).toBe('vs');
    expect(mod.initialThemeFor('dark')).toBe('vs-dark');
  });
});
