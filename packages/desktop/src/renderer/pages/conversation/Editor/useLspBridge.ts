/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Connects the active buffer to workspace-scoped LSP sessions (lazy editor chunk only).
 */

import { useEffect, useRef, useState } from 'react';

import { attachLspForBuffer, detachLspForWorkspace } from './lspSessionManager';
import { resolveLspLanguageForBuffer } from './lspLanguageId';
import type { OpenBuffer } from './types';

export type LspBridgeStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'ready'; language: string }
  | { state: 'unavailable'; reason: 'api' | 'no-workspace' | 'unsupported' }
  | { state: 'not-installed'; language: string; command?: string };

export function useLspBridge(
  activeBuffer: OpenBuffer | null,
  onStatus?: (status: LspBridgeStatus) => void
): LspBridgeStatus {
  const [status, setStatus] = useState<LspBridgeStatus>({ state: 'idle' });
  const attachGen = useRef(0);

  const publish = (next: LspBridgeStatus) => {
    setStatus(next);
    onStatus?.(next);
  };

  useEffect(() => {
    const workspace = activeBuffer?.workspace?.trim();
    if (!activeBuffer || !workspace) {
      publish({ state: 'unavailable', reason: 'no-workspace' });
      return;
    }

    const lspLanguage = resolveLspLanguageForBuffer(activeBuffer.language);
    if (!lspLanguage) {
      publish({ state: 'unavailable', reason: 'unsupported' });
      return;
    }

    const gen = (attachGen.current += 1);
    publish({ state: 'connecting' });

    // The promise itself is internal to `attachLspForBuffer` and already
    // resolves to a typed `LspAttachResult` even on failure — but we still
    // attach a `.catch` so an unexpected throw (e.g. an `onStatus` callback
    // blowing up, a dynamic import resolution error) can never bubble up as
    // an unhandled rejection. Anything thrown here is treated as an
    // `unavailable / api` state so the editor stays usable without LSP.
    void attachLspForBuffer({ workspace, lspLanguage })
      .then((result) => {
        if (gen !== attachGen.current) return;
        if (result.ok === true) {
          publish({ state: 'ready', language: result.language });
          return;
        }
        const failed = result;
        if (failed.reason === 'not-installed') {
          publish({
            state: 'not-installed',
            language: failed.language,
            command: failed.command,
          });
          return;
        }
        publish({ state: 'unavailable', reason: 'api' });
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[useLspBridge] attach failed unexpectedly; falling back to unavailable/api.', err);
        if (gen !== attachGen.current) return;
        publish({ state: 'unavailable', reason: 'api' });
      });

    return () => {
      attachGen.current += 1;
    };
  }, [activeBuffer?.key, activeBuffer?.language, activeBuffer?.workspace]);

  useEffect(() => {
    const workspace = activeBuffer?.workspace?.trim();
    if (!workspace) return undefined;
    return () => {
      void detachLspForWorkspace(workspace);
    };
  }, [activeBuffer?.workspace]);

  return status;
}
