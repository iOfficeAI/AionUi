import { describe, expect, it } from 'vitest';

import type { TChatConversation } from '@/common/storage';
import { collectRecentWorkspaces, normalizeWorkspacePath } from '@/renderer/utils/recentWorkspaces';
import { getConnectivitySettingsPath, getModalBuiltinSettingsTabIds, getPageBuiltinSettingsTabIds, resolveSettingsTabForRuntime } from '@/renderer/utils/settingsNavigation';

const createConversation = (overrides: Partial<TChatConversation>): TChatConversation =>
  ({
    id: overrides.id || 'conversation-id',
    name: overrides.name || 'Conversation',
    type: overrides.type || 'gemini',
    createTime: overrides.createTime || 0,
    modifyTime: overrides.modifyTime || 0,
    model:
      overrides.model ||
      ({
        id: 'provider-id',
        name: 'Provider',
        useModel: 'model',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
      } as TChatConversation['model']),
    extra:
      overrides.extra ||
      ({
        workspace: '',
        customWorkspace: false,
      } as TChatConversation['extra']),
  }) as TChatConversation;

describe('recent workspaces', () => {
  it('normalizes trailing separators', () => {
    expect(normalizeWorkspacePath('C:/github/AionUi///')).toBe('C:/github/AionUi');
    expect(normalizeWorkspacePath('C:\\github\\AionUi\\')).toBe('C:\\github\\AionUi');
  });

  it('merges workspace history with conversation history and keeps the latest timestamp', () => {
    const conversations = [
      createConversation({
        id: '1',
        modifyTime: 30,
        extra: {
          workspace: 'C:/github/AionUi',
          customWorkspace: true,
        },
      }),
      createConversation({
        id: '2',
        modifyTime: 10,
        extra: {
          workspace: 'C:/github/vx',
          customWorkspace: true,
        },
      }),
    ];

    const items = collectRecentWorkspaces(conversations, [
      {
        workspace: 'C:/github/vx',
        updatedAt: 40,
      },
      {
        workspace: 'C:/github/AionUi',
        updatedAt: 20,
      },
    ]);

    expect(items.map((item) => ({ path: item.path, updatedAt: item.updatedAt }))).toEqual([
      { path: 'C:/github/vx', updatedAt: 40 },
      { path: 'C:/github/AionUi', updatedAt: 30 },
    ]);
  });

  it('filters temporary and non-custom workspaces while preserving the current workspace', () => {
    const conversations = [
      createConversation({
        id: '1',
        modifyTime: 100,
        extra: {
          workspace: 'C:/Users/demo/codex-temp-1741680000000',
          customWorkspace: true,
        },
      }),
      createConversation({
        id: '2',
        modifyTime: 90,
        extra: {
          workspace: 'C:/Users/demo/Documents/not-custom',
          customWorkspace: false,
        },
      }),
    ];

    const items = collectRecentWorkspaces(conversations, [], 'C:/Users/demo/Documents/current-workspace');

    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe('C:/Users/demo/Documents/current-workspace');
    expect(items[0]?.label).toBe('current-workspace');
  });

  it('uses channels as the connectivity entry on webui and keeps webui on desktop', () => {
    expect(getConnectivitySettingsPath(true)).toBe('/settings/webui');
    expect(getConnectivitySettingsPath(false)).toBe('/settings/channels');
  });

  it('hides the webui tab from browser settings navigation while preserving channels', () => {
    expect(getPageBuiltinSettingsTabIds(true)).toContain('webui');
    expect(getPageBuiltinSettingsTabIds(false)).not.toContain('webui');
    expect(getPageBuiltinSettingsTabIds(false)).toContain('channels');

    expect(getModalBuiltinSettingsTabIds(true)).toContain('webui');
    expect(getModalBuiltinSettingsTabIds(false)).not.toContain('webui');
    expect(getModalBuiltinSettingsTabIds(false)).toContain('channels');
  });

  it('maps the legacy webui tab to channels in browser runtime', () => {
    expect(resolveSettingsTabForRuntime('webui', false)).toBe('channels');
    expect(resolveSettingsTabForRuntime('channels', false)).toBe('channels');
    expect(resolveSettingsTabForRuntime('webui', true)).toBe('webui');
  });
});
