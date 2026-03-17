/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mock instances that survive across dynamic imports
const mockTrayInstance = {
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
};

const mockMenuInstance = { items: [] };
const mockBuildFromTemplate = vi.fn(() => mockMenuInstance);
const mockListTasks = vi.fn(() => []);
const mockGetUserConversations = vi.fn(() => ({ data: [] }));
const mockGetDatabase = vi.fn(() => ({
  getUserConversations: mockGetUserConversations,
}));

const mockNativeImage = {
  resize: vi.fn().mockReturnThis(),
  isEmpty: vi.fn(() => false),
};

// Tray must be a proper constructor for `new Tray(icon)` to work
class MockTray {
  constructor() {
    Object.assign(this, mockTrayInstance);
  }
}

const mockModules = () => {
  vi.doMock('electron', () => ({
    app: {
      isPackaged: false,
      relaunch: vi.fn(),
      exit: vi.fn(),
      quit: vi.fn(),
    },
    Tray: MockTray,
    Menu: {
      buildFromTemplate: mockBuildFromTemplate,
    },
    nativeImage: {
      createFromPath: vi.fn(() => mockNativeImage),
    },
  }));

  vi.doMock('@/common', () => ({
    ipcBridge: {
      systemSettings: {
        setCloseToTray: { invoke: vi.fn() },
      },
    },
  }));

  vi.doMock('@process/i18n', () => ({
    default: { t: vi.fn((key: string) => key) },
  }));

  vi.doMock('@/process/WorkerManage', () => ({
    default: { listTasks: mockListTasks },
  }));

  vi.doMock('@/process/database', () => ({
    getDatabase: mockGetDatabase,
  }));
};

describe('tray module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockModules();
  });

  afterEach(() => {
    vi.doUnmock('electron');
    vi.doUnmock('@/common');
    vi.doUnmock('@process/i18n');
    vi.doUnmock('@/process/WorkerManage');
    vi.doUnmock('@/process/database');
  });

  describe('state accessors', () => {
    it('should get/set closeToTrayEnabled', async () => {
      const { getCloseToTrayEnabled, setCloseToTrayEnabled } = await import('@/process/tray');

      expect(getCloseToTrayEnabled()).toBe(false);
      setCloseToTrayEnabled(true);
      expect(getCloseToTrayEnabled()).toBe(true);
      setCloseToTrayEnabled(false);
      expect(getCloseToTrayEnabled()).toBe(false);
    });

    it('should get/set isQuitting', async () => {
      const { getIsQuitting, setIsQuitting } = await import('@/process/tray');

      expect(getIsQuitting()).toBe(false);
      setIsQuitting(true);
      expect(getIsQuitting()).toBe(true);
    });

    it('should set main window reference', async () => {
      const { setTrayMainWindow } = await import('@/process/tray');
      const mockWindow = { show: vi.fn(), focus: vi.fn() } as any;

      expect(() => setTrayMainWindow(mockWindow)).not.toThrow();
    });
  });

  describe('createOrUpdateTray', () => {
    it('should create a tray with tooltip', async () => {
      const { createOrUpdateTray } = await import('@/process/tray');

      createOrUpdateTray();

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('AionUi');
    });

    it('should be idempotent - second call does not create another tray', async () => {
      const { createOrUpdateTray } = await import('@/process/tray');

      createOrUpdateTray();
      const firstCallCount = mockTrayInstance.setToolTip.mock.calls.length;

      createOrUpdateTray();
      // setToolTip should not be called again
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should register double-click and click event handlers', async () => {
      const { createOrUpdateTray } = await import('@/process/tray');

      createOrUpdateTray();

      const eventNames = mockTrayInstance.on.mock.calls.map((call) => call[0]);
      expect(eventNames).toContain('double-click');
      expect(eventNames).toContain('click');
    });

    it('should handle Tray constructor failure gracefully', async () => {
      // Re-mock with a throwing Tray constructor
      vi.doUnmock('electron');
      vi.doMock('electron', () => ({
        app: { isPackaged: false, relaunch: vi.fn(), exit: vi.fn(), quit: vi.fn() },
        Tray: class {
          constructor() {
            throw new Error('Tray init failed');
          }
        },
        Menu: { buildFromTemplate: vi.fn(() => mockMenuInstance) },
        nativeImage: { createFromPath: vi.fn(() => mockNativeImage) },
      }));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { createOrUpdateTray } = await import('@/process/tray');

      createOrUpdateTray();

      expect(consoleSpy).toHaveBeenCalledWith('[Tray] Failed to create tray:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('destroyTray', () => {
    it('should destroy tray and allow recreation', async () => {
      const { createOrUpdateTray, destroyTray } = await import('@/process/tray');

      createOrUpdateTray();
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledOnce();

      destroyTray();
      expect(mockTrayInstance.destroy).toHaveBeenCalledOnce();

      // After destroy, createOrUpdateTray should create a new one
      mockTrayInstance.setToolTip.mockClear();
      createOrUpdateTray();
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledOnce();
    });

    it('should be safe to call when no tray exists', async () => {
      const { destroyTray } = await import('@/process/tray');

      expect(() => destroyTray()).not.toThrow();
      expect(mockTrayInstance.destroy).not.toHaveBeenCalled();
    });
  });

  describe('refreshTrayMenu', () => {
    it('should rebuild context menu when tray exists', async () => {
      const { Menu } = await import('electron');
      const { createOrUpdateTray, refreshTrayMenu } = await import('@/process/tray');

      createOrUpdateTray();
      // Wait for initial async menu build to complete
      await new Promise((r) => setTimeout(r, 50));
      mockTrayInstance.setContextMenu.mockClear();
      (Menu.buildFromTemplate as ReturnType<typeof vi.fn>).mockClear();

      await refreshTrayMenu();

      expect(Menu.buildFromTemplate).toHaveBeenCalledOnce();
      expect(mockTrayInstance.setContextMenu).toHaveBeenCalledWith(mockMenuInstance);
    });

    it('should be a no-op when no tray exists', async () => {
      const { Menu } = await import('electron');
      const { refreshTrayMenu } = await import('@/process/tray');

      await refreshTrayMenu();

      expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('context menu content', () => {
    const setupWithOverrides = () => {
      vi.resetModules();
      vi.clearAllMocks();
      mockModules();
    };

    const waitForNextMenuTemplate = async (previousCalls: number): Promise<any[]> => {
      for (let i = 0; i < 20; i += 1) {
        const calls = mockBuildFromTemplate.mock.calls;
        if (calls.length > previousCalls) {
          const templateCall = calls.at(-1);
          if (templateCall) {
            return templateCall[0] as any[];
          }
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('Menu template was not built in time');
    };

    it('should include recent conversations when available', async () => {
      setupWithOverrides();
      mockGetUserConversations.mockReturnValue({
        data: [
          { id: '1', name: 'Test Chat' },
          { id: '2', name: 'Another Chat' },
        ],
      });

      const { createOrUpdateTray } = await import('@/process/tray');
      const previousCalls = mockBuildFromTemplate.mock.calls.length;
      createOrUpdateTray();

      const templateArg = await waitForNextMenuTemplate(previousCalls);
      const labels = templateArg.map((item: any) => item.label).filter(Boolean);
      expect(labels).toContain('Test Chat');
      expect(labels).toContain('Another Chat');
    });

    it('should truncate long conversation titles to 20 chars', async () => {
      setupWithOverrides();
      mockGetUserConversations.mockReturnValue({
        data: [{ id: '1', name: 'A very long conversation title that exceeds twenty characters' }],
      });

      const { createOrUpdateTray } = await import('@/process/tray');
      const previousCalls = mockBuildFromTemplate.mock.calls.length;
      createOrUpdateTray();

      const templateArg = await waitForNextMenuTemplate(previousCalls);
      const labels = templateArg.map((item: any) => item.label).filter(Boolean);
      const expectedTitle = 'A very long conversation title that exceeds twenty characters'.slice(0, 20) + '...';
      expect(labels).toContain(expectedTitle);
    });

    it('should show running tasks count', async () => {
      setupWithOverrides();
      mockListTasks.mockReturnValue([{ id: '1' }, { id: '2' }, { id: '3' }]);

      const { createOrUpdateTray } = await import('@/process/tray');
      const previousCalls = mockBuildFromTemplate.mock.calls.length;
      createOrUpdateTray();

      const templateArg = await waitForNextMenuTemplate(previousCalls);
      const taskItem = templateArg.find((item: any) => item.label?.includes('3'));
      expect(taskItem).toBeDefined();
      expect(taskItem.enabled).toBe(false);
    });

    it('should gracefully handle database errors for recent conversations', async () => {
      setupWithOverrides();
      mockGetDatabase.mockImplementation(() => {
        throw new Error('DB unavailable');
      });

      const { createOrUpdateTray } = await import('@/process/tray');
      createOrUpdateTray();

      // Should still build menu without crashing
      const previousCalls = mockBuildFromTemplate.mock.calls.length;
      await expect(waitForNextMenuTemplate(previousCalls)).resolves.toBeDefined();

      // Restore default for any subsequent tests
      mockGetDatabase.mockImplementation(() => ({
        getUserConversations: mockGetUserConversations,
      }));
    });
  });
});
