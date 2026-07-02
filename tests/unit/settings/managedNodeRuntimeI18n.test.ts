/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function loadSettingsLocale(language: string): Record<string, string> {
  const url = new URL(
    `../../../packages/desktop/src/renderer/services/i18n/locales/${language}/settings.json`,
    import.meta.url
  );
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, string>;
}

function loadCommonLocale(language: string): Record<string, unknown> {
  const url = new URL(
    `../../../packages/desktop/src/renderer/services/i18n/locales/${language}/common.json`,
    import.meta.url
  );
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
}

function loadConversationLocale(language: string): Record<string, unknown> {
  const url = new URL(
    `../../../packages/desktop/src/renderer/services/i18n/locales/${language}/conversation.json`,
    import.meta.url
  );
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
}

describe('managed node runtime settings copy', () => {
  it('does not tell MCP users to install Node.js when npx/node preparation fails', () => {
    const en = loadSettingsLocale('en-US');
    const zh = loadSettingsLocale('zh-CN');

    expect(en.mcpErrorNodeCommandNotFound).not.toContain('Install Node.js');
    expect(en.mcpErrorNodeCommandNotFound).toContain('managed Node runtime');

    expect(zh.mcpErrorNodeCommandNotFound).not.toContain('安装 Node.js');
    expect(zh.mcpErrorNodeCommandNotFound).toContain('托管的 Node');
  });

  it('keeps the warmup hint generic until the backend can prove node-specific preparation', () => {
    const en = loadConversationLocale('en-US');
    const zh = loadConversationLocale('zh-CN');

    expect((en.runtimePreparing as Record<string, string>).sendboxHint).toContain('runtime environment');
    expect((en.runtimePreparing as Record<string, string>).sendboxHint).not.toContain('managed Node');

    expect((zh.runtimePreparing as Record<string, string>).sendboxHint).toContain('运行环境');
    expect((zh.runtimePreparing as Record<string, string>).sendboxHint).not.toContain('托管的 Node');
  });

  it('localizes the installation-integrity runtime guidance for supported non-English languages', () => {
    for (const language of ['ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW']) {
      const common = loadCommonLocale(language);
      const backendStartup = common.backendStartup as Record<string, unknown>;
      const incompleteInstallation = backendStartup.incompleteInstallation as Record<string, string>;

      expect(incompleteInstallation.sendDiagnostics).toBeTruthy();
      expect(incompleteInstallation.runtimeComponentDescription).not.toMatch(/^This installation is missing/);
    }
  });

  it('defines local data repair startup copy in every common locale', () => {
    for (const language of ['de-DE', 'en-US', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW']) {
      const common = loadCommonLocale(language);
      const backendStartup = common.backendStartup as Record<string, unknown>;
      const localDataRepair = backendStartup.localDataRepair as Record<string, string>;

      expect(localDataRepair.title).toBeTruthy();
      expect(localDataRepair.description).toBeTruthy();
      expect(localDataRepair.sendDiagnostics).toBeTruthy();
      expect(localDataRepair.diagnosticsSent).toBeTruthy();
      expect(localDataRepair.diagnosticsReportSuccess).toBeTruthy();
      expect(localDataRepair.diagnosticsReportFailed).toBeTruthy();
    }
  });
});
