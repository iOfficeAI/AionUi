/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-shot Codingame / VS Code API bootstrap for the lazy editor chunk only.
 * Must complete before the first `monaco.editor.create` in that chunk.
 *
 * Hardening notes (see commit "fix(editor): prevent white-page crash"):
 *   1. The wrapper boot pulls in the entire `monaco-vscode-api` graph (workers,
 *      ext host, configuration services). A bad bundler resolution, a worker
 *      `?worker` chunk that 404s, or a service-override mismatch can throw at
 *      `wrapper.start()` and propagate up. We catch that here and try the
 *      'classic' `$type` config (no views service) as a degraded fallback so
 *      the renderer still boots even if the extended service set is broken.
 *   2. The first failure is logged at `console.error` and re-thrown so the
 *      caller (`editorLazyEntry`) can show the "lspInitFailed" surface.
 *   3. The fallback only kicks in if the extended boot threw — the common
 *      happy path is unchanged.
 *
 * Post-init theme registration:
 *   After `wrapper.start()` succeeds (both extended and classic paths), we
 *   call `ensureAionuiThemesRegistered()` from `monacoTheme.ts`. That helper
 *   is now defensive: once the workbench theme service is in scope,
 *   `IStandaloneThemeService` may not expose `defineTheme`. The helper probes
 *   the service and, if `defineTheme` is missing, falls back to
 *   `monaco.editor.setTheme(base)` so the editor surface always has a theme
 *   before `MonacoEditor` mounts (otherwise the editor reports "Editor
 *   unavailable").
 */

import { LogLevel } from '@codingame/monaco-vscode-api';

let initPromise: Promise<void> | null = null;

type InitConfig = {
  $type: 'extended' | 'classic';
  viewsConfig: { $type: 'EditorService' };
  logLevel: typeof LogLevel.Off;
  monacoWorkerFactory: (logger?: unknown) => void;
  advanced: { enableExtHostWorker: boolean; loadThemes: boolean };
  userConfiguration: { json: string };
};

const bootWrapper = async ($type: 'extended' | 'classic'): Promise<void> => {
  const { MonacoVscodeApiWrapper } = await import('monaco-languageclient/vscodeApiWrapper');
  const { configureDefaultWorkerFactory } = await import('monaco-languageclient/workerFactory');

  const config: InitConfig = {
    $type,
    viewsConfig: {
      $type: 'EditorService',
    },
    logLevel: LogLevel.Off,
    monacoWorkerFactory: configureDefaultWorkerFactory,
    advanced: {
      enableExtHostWorker: false,
      loadThemes: false,
    },
    userConfiguration: {
      json: JSON.stringify({
        'editor.wordBasedSuggestions': 'off',
        'editor.quickSuggestions': { other: true, comments: false, strings: true },
      }),
    },
  };

  const wrapper = new MonacoVscodeApiWrapper(config);
  await wrapper.start();
};

/**
 * Register Chisl's custom Monaco themes against the post-wrapper service
 * registry. The registration helper is now defensive — see
 * `monacoTheme.ts` for the workbench-service fallback — so it's safe to
 * call unconditionally on every successful init. We dynamically import
 * `monacoTheme` so the heavy editor chunk isn't pulled into the
 * `editorLazyEntry` evaluation path before the wrapper has booted.
 */
const registerAionuiThemesPostInit = async (): Promise<void> => {
  try {
    const themeMod = await import('./monacoTheme');
    themeMod.ensureAionuiThemesRegistered();
  } catch (themeErr) {
    // Theme registration is best-effort: the editor can still render with
    // Monaco's built-in `vs` / `vs-dark` themes if our custom registration
    // blows up. Log and move on rather than marking the editor unavailable.
    // eslint-disable-next-line no-console
    console.warn(
      '[editorLazyEntry] Post-init theme registration failed; falling back to built-in Monaco themes.',
      themeErr
    );
  }
};

export async function ensureMonacoVscodeApiInitialized(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await bootWrapper('extended');
      await registerAionuiThemesPostInit();
      return;
    } catch (extendedErr) {
      const msg = extendedErr instanceof Error ? extendedErr.message : String(extendedErr);
      if (msg.includes('already been loaded')) {
        initPromise = null;
        throw extendedErr instanceof Error ? extendedErr : new Error(msg);
      }
      // eslint-disable-next-line no-console
      console.error(
        '[editorLazyEntry] MonacoVscodeApiWrapper extended init failed; retrying with classic $type.',
        extendedErr
      );
      try {
        await bootWrapper('classic');
        // eslint-disable-next-line no-console
        console.warn(
          '[editorLazyEntry] Fell back to MonacoVscodeApiWrapper classic init; some advanced features may be disabled.'
        );
        await registerAionuiThemesPostInit();
        return;
      } catch (classicErr) {
        // eslint-disable-next-line no-console
        console.error(
          '[editorLazyEntry] MonacoVscodeApiWrapper classic init also failed; editor will be unavailable.',
          classicErr
        );
        initPromise = null;
        throw classicErr instanceof Error ? classicErr : new Error(String(classicErr));
      }
    }
  })();

  return initPromise;
}
