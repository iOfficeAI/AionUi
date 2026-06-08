/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lazy entry for the full editor stack (Codingame Monaco + LSP). Import only via
 * `React.lazy(() => import('./editorLazyEntry'))` — never from the Editor barrel.
 *
 * Hardening notes (see commit "fix(editor): prevent white-page crash"):
 *   - The Codingame VS Code API init is a heavy, multi-service bootstrap.
 *     `monaco-languageclient/vscodeApiWrapper`, `monaco-languageclient/workerFactory`,
 *     and the `@codingame/monaco-vscode-api` graph together pull in workers,
 *     configuration services, and an extension host. A single missing chunk /
 *     mismatched worker URL / failed `start()` call would previously propagate
 *     past this file and crash the renderer (the user-reported "white page").
 *   - We therefore:
 *       (a) load `monacoVscodeApiInit` lazily via `import()` inside the effect
 *           so a failed import is caught and degrades to the fallback UI
 *           instead of throwing at module-evaluation time of the lazy chunk;
 *       (b) `console.error` every failure with a `[editorLazyEntry]` prefix so
 *           the renderer dev-tools console shows the cause;
 *       (c) keep the spinner / failure / ready state machine so the surrounding
 *           Suspense never gets stuck in an undefined state.
 *
 * Theme registration is tolerant of the VS Code theme service:
 *   - `monacoVscodeApiInit` calls `ensureAionuiThemesRegistered()` (from
 *     `monacoTheme.ts`) right after `wrapper.start()` succeeds, on both
 *     the extended and the classic fallback paths. That helper probes
 *     `IStandaloneThemeService` and, if it lacks `defineTheme` (the
 *     workbench override case), falls back to `monaco.editor.setTheme(base)`
 *     instead of throwing. `MonacoEditor` also calls the same helper on
 *     mount, so the editor surface always has a valid theme before its
 *     first `monaco.editor.create`.
 */

import React, { useEffect, useState } from 'react';
import { Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

import EditorPanel from './EditorPanel';
import './editor.css';

export type EditorLazyEntryProps = {
  workspaceRoot?: string;
};

type InitState = 'pending' | 'ready' | 'failed';

const EditorLazyEntry: React.FC<EditorLazyEntryProps> = ({ workspaceRoot }) => {
  const { t } = useTranslation();
  const [initState, setInitState] = useState<InitState>('pending');

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        // Dynamic import — keeps the heavy Codingame graph out of the chunk's
        // top-level evaluation. If this `import()` rejects (chunk 404, syntax
        // error in the graph, etc.) we degrade to the failure UI rather than
        // letting the rejection escape the effect.
        const mod = await import('./monacoVscodeApiInit');
        await mod.ensureMonacoVscodeApiInitialized();
        if (!cancelled) setInitState('ready');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[editorLazyEntry] Monaco VS Code API init failed; rendering failure surface.', err);
        if (!cancelled) setInitState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (initState === 'failed') {
    return (
      <div className='editor-panel editor-panel__loading'>
        <span>{t('conversation.editor.lspInitFailed')}</span>
      </div>
    );
  }

  if (initState !== 'ready') {
    return (
      <div className='editor-panel editor-panel__loading'>
        <Spin />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  return <EditorPanel workspaceRoot={workspaceRoot} />;
};

export default EditorLazyEntry;
