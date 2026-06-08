/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listServers, startSession, stopSession, start, dispose, isStarted } = vi.hoisted(() => ({
  listServers: vi.fn(),
  startSession: vi.fn(),
  stopSession: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn().mockResolvedValue(undefined),
  isStarted: vi.fn().mockReturnValue(false),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (path: string) => ({ fsPath: path, toString: () => path }),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    lsp: {
      listServers: { invoke: listServers },
      startSession: { invoke: startSession },
      stopSession: { invoke: stopSession },
    },
  },
}));

vi.mock('monaco-languageclient/lcwrapper', () => ({
  LanguageClientWrapper: class MockLanguageClientWrapper {
    start = start;
    dispose = dispose;
    isStarted = isStarted;
  },
}));

import {
  attachLspForBuffer,
  detachLspForWorkspace,
  disposeAllLspSessions,
} from '@/renderer/pages/conversation/Editor/lspSessionManager';

describe('lspSessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStarted.mockReturnValue(false);
    listServers.mockResolvedValue([{ language: 'typescript', installed: true, command: 'typescript-language-server' }]);
    startSession.mockResolvedValue({ session_id: 'sess-1', language: 'typescript' });
  });

  afterEach(async () => {
    await disposeAllLspSessions();
  });

  it('returns not-installed when server binary is missing', async () => {
    listServers.mockResolvedValue([
      {
        language: 'typescript',
        installed: false,
        command: 'typescript-language-server',
        install_hint: 'npm i -g typescript-language-server',
      },
    ]);

    const result = await attachLspForBuffer({ workspace: '/ws', lspLanguage: 'typescript' });
    expect(result).toEqual({
      ok: false,
      reason: 'not-installed',
      language: 'typescript',
      command: 'npm i -g typescript-language-server',
    });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('starts a session and reuses it for the same workspace and language', async () => {
    const first = await attachLspForBuffer({ workspace: '/ws', lspLanguage: 'typescript' });
    expect(first).toEqual({ ok: true, language: 'typescript' });
    expect(startSession).toHaveBeenCalledTimes(1);

    isStarted.mockReturnValue(true);
    const second = await attachLspForBuffer({ workspace: '/ws', lspLanguage: 'typescript' });
    expect(second).toEqual({ ok: true, language: 'typescript' });
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('detachLspForWorkspace stops backend session', async () => {
    await attachLspForBuffer({ workspace: '/ws', lspLanguage: 'typescript' });
    await detachLspForWorkspace('/ws');
    expect(dispose).toHaveBeenCalled();
    expect(stopSession).toHaveBeenCalledWith({ session_id: 'sess-1' });
  });
});
