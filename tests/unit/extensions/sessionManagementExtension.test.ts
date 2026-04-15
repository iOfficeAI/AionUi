import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionRoot = path.resolve(process.cwd(), 'extensions/session-management');

describe('session-management bundled extension', () => {
  it('declares an api-adjacent settings tab and the expected host actions', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'aion-extension.json'), 'utf8'));
    const tabs = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'contributes/settings-tabs.json'), 'utf8'));
    const script = fs.readFileSync(path.join(extensionRoot, 'settings/session-management.js'), 'utf8');
    const enTab = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'i18n/en-US/extension.json'), 'utf8'));
    const zhTab = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'i18n/zh-CN/extension.json'), 'utf8'));

    expect(manifest).toMatchObject({
      name: 'session-management',
      i18n: {
        localesDir: 'i18n',
        defaultLocale: 'en-US',
      },
    });
    expect(tabs).toEqual([
      expect.objectContaining({
        id: 'session-management',
        entryPoint: 'settings/session-management.html',
        position: { anchor: 'api', placement: 'after' },
      }),
    ]);
    expect(script).toContain('conversation.searchManaged');
    expect(script).toContain('conversation.removeMany');
    expect(script).toContain('conversation.open');
    expect(enTab.settingsTabs['session-management'].name).toBe('Session Management');
    expect(zhTab.settingsTabs['session-management'].name).toBe('会话管理');
  });
});
