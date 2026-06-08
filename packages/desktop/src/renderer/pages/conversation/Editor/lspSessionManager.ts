/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-(workspace, LSP language) language client sessions over AionCore `aionui-lsp`.
 */

import { ipcBridge } from '@/common';
import { LanguageClientWrapper } from 'monaco-languageclient/lcwrapper';
import * as vscode from 'vscode';

import { buildLspSessionWebSocketUrl } from './lspWebSocketUrl';
import { monacoDocumentSelectorsForLsp } from './lspLanguageId';

type SessionKey = string;

const sessionKey = (workspace: string, language: string): SessionKey => `${workspace}::${language}`;

type ManagedSession = {
  workspace: string;
  language: string;
  sessionId: string;
  wrapper: LanguageClientWrapper;
};

const sessions = new Map<SessionKey, ManagedSession>();

export type LspAttachResult =
  | { ok: true; language: string }
  | { ok: false; reason: 'not-installed'; language: string; command?: string }
  | { ok: false; reason: 'error'; language: string; message: string };

export async function attachLspForBuffer(options: {
  workspace: string;
  lspLanguage: string;
}): Promise<LspAttachResult> {
  const { workspace, lspLanguage } = options;
  const key = sessionKey(workspace, lspLanguage);
  const existing = sessions.get(key);
  if (existing?.wrapper.isStarted()) {
    return { ok: true, language: lspLanguage };
  }

  const servers = await ipcBridge.lsp.listServers.invoke();
  const server = servers.find((s) => s.language === lspLanguage);
  if (!server) {
    return { ok: false, reason: 'error', language: lspLanguage, message: 'Unknown LSP language' };
  }
  if (!server.installed) {
    return {
      ok: false,
      reason: 'not-installed',
      language: lspLanguage,
      command: server.install_hint ?? server.command,
    };
  }

  try {
    const { session_id: sessionId } = await ipcBridge.lsp.startSession.invoke({
      language: lspLanguage,
      workspace,
    });

    const workspaceUri = vscode.Uri.file(workspace.replace(/\\/g, '/'));
    const selectors = monacoDocumentSelectorsForLsp(lspLanguage);

    const wrapper = new LanguageClientWrapper({
      languageId: lspLanguage,
      connection: {
        options: {
          $type: 'WebSocketUrl',
          url: buildLspSessionWebSocketUrl(sessionId),
        },
      },
      clientOptions: {
        documentSelector: selectors,
        workspaceFolder: {
          index: 0,
          name: 'workspace',
          uri: workspaceUri,
        },
      },
    });

    await wrapper.start();

    const managed: ManagedSession = { workspace, language: lspLanguage, sessionId, wrapper };
    sessions.set(key, managed);

    return { ok: true, language: lspLanguage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'error', language: lspLanguage, message };
  }
}

export async function detachLspForWorkspace(workspace: string): Promise<void> {
  const toStop: ManagedSession[] = [];
  for (const [key, session] of sessions) {
    if (session.workspace === workspace) {
      toStop.push(session);
      sessions.delete(key);
    }
  }
  await Promise.all(
    toStop.map(async (session) => {
      try {
        await session.wrapper.dispose();
      } catch {
        // ignore dispose errors
      }
      try {
        await ipcBridge.lsp.stopSession.invoke({ session_id: session.sessionId });
      } catch {
        // ignore stop errors
      }
    })
  );
}

export async function disposeAllLspSessions(): Promise<void> {
  const all = [...sessions.values()];
  sessions.clear();
  await Promise.all(
    all.map(async (session) => {
      try {
        await session.wrapper.dispose();
      } catch {
        // ignore
      }
      try {
        await ipcBridge.lsp.stopSession.invoke({ session_id: session.sessionId });
      } catch {
        // ignore
      }
    })
  );
}
