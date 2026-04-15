import type { TChatConversation } from '@/common/config/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getApiDiagnosticsStateInvoke,
  showItemInFolderInvoke,
  searchManagedConversationsInvoke,
  removeConversationInvoke,
  openTab,
  closeAllTabs,
  navigateToConversation,
} = vi.hoisted(() => ({
  getApiDiagnosticsStateInvoke: vi.fn(),
  showItemInFolderInvoke: vi.fn(),
  searchManagedConversationsInvoke: vi.fn(),
  removeConversationInvoke: vi.fn(),
  openTab: vi.fn(),
  closeAllTabs: vi.fn(),
  navigateToConversation: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getApiDiagnosticsState: { invoke: getApiDiagnosticsStateInvoke },
      updateApiDiagnosticsConfig: { invoke: vi.fn() },
      captureApiDiagnosticsSnapshot: { invoke: vi.fn() },
      getApiDiagnosticsLiveSnapshot: { invoke: vi.fn() },
      getApiDiagnosticsHistory: { invoke: vi.fn() },
    },
    database: {
      searchManagedConversations: { invoke: searchManagedConversationsInvoke },
    },
    conversation: {
      remove: { invoke: removeConversationInvoke },
    },
    shell: {
      showItemInFolder: { invoke: showItemInFolderInvoke },
    },
  },
}));

import { getExtensionHostApiHandlers } from '../../../src/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent/hostApiHandlers';

describe('getExtensionHostApiHandlers', () => {
  beforeEach(() => {
    getApiDiagnosticsStateInvoke.mockReset();
    showItemInFolderInvoke.mockReset();
    searchManagedConversationsInvoke.mockReset();
    removeConversationInvoke.mockReset();
    openTab.mockReset();
    closeAllTabs.mockReset();
    navigateToConversation.mockReset();
  });

  it('returns diagnostics handlers for the embedded api diagnostics extension', async () => {
    getApiDiagnosticsStateInvoke.mockResolvedValue({ enabled: true });
    showItemInFolderInvoke.mockResolvedValue(undefined);

    const handlers = getExtensionHostApiHandlers('api-diagnostics-devtools', 'E:/logs/output.json');

    await expect(handlers?.['application.getApiDiagnosticsState']()).resolves.toEqual({ enabled: true });
    await expect(handlers?.['shell.showItemInFolder']()).resolves.toEqual({ success: true });
    expect(showItemInFolderInvoke).toHaveBeenCalledWith('E:/logs/output.json');
  });

  it('returns undefined for unrelated extensions and rejects invalid shell payloads', async () => {
    expect(getExtensionHostApiHandlers('star-office', null)).toBeUndefined();

    const handlers = getExtensionHostApiHandlers('api-diagnostics-devtools', '');

    await expect(handlers?.['shell.showItemInFolder']()).rejects.toThrow('Missing path');
    expect(showItemInFolderInvoke).not.toHaveBeenCalled();
  });

  it('returns session-management handlers for search, delete, and open', async () => {
    const conversation = {
      id: 'conversation-1',
      name: 'Workspace Audit',
      type: 'codex',
      createTime: 1,
      modifyTime: 2,
      extra: {
        workspace: '/tmp/project-a',
        customWorkspace: true,
      },
    } satisfies TChatConversation;

    searchManagedConversationsInvoke.mockResolvedValue({
      items: [conversation],
      total: 1,
      page: 0,
      pageSize: 20,
      hasMore: false,
    });
    removeConversationInvoke.mockResolvedValue(true);
    navigateToConversation.mockResolvedValue(undefined);

    const handlers = getExtensionHostApiHandlers(
      'session-management',
      { ids: ['conversation-1'], conversation, category: 'codex' },
      {
        activeWorkspace: null,
        closeAllTabs,
        openTab,
        navigateToConversation,
      }
    );

    await expect(handlers?.['conversation.searchManaged']()).resolves.toEqual(
      expect.objectContaining({ items: [conversation], total: 1 })
    );
    await expect(handlers?.['conversation.removeMany']()).resolves.toEqual({
      ids: ['conversation-1'],
      successCount: 1,
    });
    await expect(handlers?.['conversation.open']()).resolves.toEqual({ success: true });

    expect(searchManagedConversationsInvoke).toHaveBeenCalledWith(expect.objectContaining({ category: 'codex' }));
    expect(removeConversationInvoke).toHaveBeenCalledWith({ id: 'conversation-1' });
    expect(openTab).toHaveBeenCalledWith(conversation);
    expect(navigateToConversation).toHaveBeenCalledWith('conversation-1');
  });
});
