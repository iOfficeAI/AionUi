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
});
