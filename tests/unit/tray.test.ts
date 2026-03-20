/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalPlatform = process.platform;

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
const mockDock = {
  show: vi.fn(),
  hide: vi.fn(),
};

const createMockWindow = () =>
  ({
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  }) as any;

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
      dock: mockDock,
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

  vi.doMock('@process/services/i18n', () => ({
    default: { t: vi.fn((key: string) => key) },
  }));

  vi.doMock('@process/task/workerTaskManagerSingleton', () => ({
    workerTaskManager: { listTasks: mockListTasks },
  }));

  vi.doMock('@process/services/database', () => ({
    getDatabase: mockGetDatabase,
  }));
};

describe('tray module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    mockModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    vi.doUnmock('electron');
    vi.doUnmock('@/common');
    vi.doUnmock('@process/services/i18n');
    vi.doUnmock('@process/task/workerTaskManagerSingleton');
    vi.doUnmock('@process/services/database');
  });

  describe('state accessors', () => {
    it('should get/set closeToTrayEnabled', async () => {
      const { getCloseToTrayEnabled, setCloseToTrayEnabled } = await import('@process/utils/tray');

      expect(getCloseToTrayEnabled()).toBe(false);
      setCloseToTrayEnabled(true);
      expect(getCloseToTrayEnabled()).toBe(true);
      setCloseToTrayEnabled(false);
      expect(getCloseToTrayEnabled()).toBe(false);
    });

    it('should get/set isQuitting', async () => {
      const { getIsQuitting, setIsQuitting } = await import('@process/utils/tray');

      expect(getIsQuitting()).toBe(false);
      setIsQuitting(true);
      expect(getIsQuitting()).toBe(true);
    });

    it('should set main window reference', async () => {
      const { setTrayMainWindow } = await import('@process/utils/tray');
      const mockWindow = createMockWindow();

      expect(() => setTrayMainWindow(mockWindow)).not.toThrow();
    });
  });

  describe('createOrUpdateTray', () => {
    it('should create a tray with tooltip', async () => {
      const { createOrUpdateTray } = await import('@process/utils/tray');

      createOrUpdateTray();

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('AionUi');
    });

    it('should be idempotent - second call does not create another tray', async () => {
      const { createOrUpdateTray } = await import('@process/utils/tray');

      createOrUpdateTray();
      const firstCallCount = mockTrayInstance.setToolTip.mock.calls.length;

      createOrUpdateTray();
      // setToolTip should not be called again
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should register double-click and click event handlers', async () => {
      const { createOrUpdateTray } = await import('@process/utils/tray');

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
      const { createOrUpdateTray } = await import('@process/utils/tray');

      createOrUpdateTray();

      expect(consoleSpy).toHaveBeenCalledWith('[Tray] Failed to create tray:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('destroyTray', () => {
    it('should destroy tray and allow recreation', async () => {
      const { createOrUpdateTray, destroyTray } = await import('@process/utils/tray');

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
      const { destroyTray } = await import('@process/utils/tray');

      expect(() => destroyTray()).not.toThrow();
      expect(mockTrayInstance.destroy).not.toHaveBeenCalled();
    });
  });

  describe('refreshTrayMenu', () => {
    it('should rebuild context menu when tray exists', async () => {
      const { createOrUpdateTray, refreshTrayMenu } = await import('@process/utils/tray');

      createOrUpdateTray();
      // Wait for initial async menu build to complete
      await new Promise((r) => setTimeout(r, 50));
      mockTrayInstance.setContextMenu.mockClear();
      mockBuildFromTemplate.mockClear();

      await refreshTrayMenu();

      expect(mockBuildFromTemplate).toHaveBeenCalledOnce();
      expect(mockTrayInstance.setContextMenu).toHaveBeenCalledWith(mockMenuInstance);
    });

    it('should be a no-op when no tray exists', async () => {
      const { refreshTrayMenu } = await import('@process/utils/tray');

      // Flush any pending micro-tasks from previous tests, then clear
      await new Promise((r) => setTimeout(r, 50));
      mockBuildFromTemplate.mockClear();

      await refreshTrayMenu();

      expect(mockBuildFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('context menu content', () => {
    const setupWithOverrides = () => {
      vi.resetModules();
      vi.clearAllMocks();
      mockModules();
      mockListTasks.mockReturnValue([]);
      mockGetUserConversations.mockReturnValue({ data: [] });
      mockGetDatabase.mockImplementation(() => ({
        getUserConversations: mockGetUserConversations,
      }));
    };

    const getTemplateFromRefresh = async () => {
      // Pre-import mocked modules to ensure doMock is resolved before tray imports them
      await import('electron');
      await import('@process/services/database');
      const { createOrUpdateTray, refreshTrayMenu } = await import('@process/utils/tray');
      createOrUpdateTray();
      const previousCalls = mockBuildFromTemplate.mock.calls.length;
      await refreshTrayMenu();
      expect(mockBuildFromTemplate.mock.calls.length).toBeGreaterThan(previousCalls);
      return mockBuildFromTemplate.mock.calls[previousCalls][0] as any[];
    };

    it('should include recent conversations when available', async () => {
      setupWithOverrides();
      mockGetUserConversations.mockReturnValue({
        data: [
          { id: '1', name: 'Test Chat' },
          { id: '2', name: 'Another Chat' },
        ],
      });

      const templateArg = await getTemplateFromRefresh();
      const labels = templateArg.map((item: any) => item.label).filter(Boolean);
      expect(labels).toContain('Test Chat');
      expect(labels).toContain('Another Chat');
    });

    it('should truncate long conversation titles to 20 chars', async () => {
      setupWithOverrides();
      mockGetUserConversations.mockReturnValue({
        data: [{ id: '1', name: 'A very long conversation title that exceeds twenty characters' }],
      });

      const expectedTitle = 'A very long conversation title that exceeds twenty characters'.slice(0, 20) + '...';
      const templateArg = await getTemplateFromRefresh();
      const labels = templateArg.map((item: any) => item.label).filter(Boolean);
      expect(labels).toContain(expectedTitle);
    });

    it('should show running tasks count', async () => {
      setupWithOverrides();
      mockListTasks.mockReturnValue([{ id: '1' }, { id: '2' }, { id: '3' }] as never[]);

      const templateArg = await getTemplateFromRefresh();
      const taskItem = templateArg.find((item: any) => item.label?.includes('3'));
      expect(taskItem).toBeDefined();
      expect(taskItem.enabled).toBe(false);
    });

    it('should gracefully handle database errors for recent conversations', async () => {
      setupWithOverrides();
      mockGetDatabase.mockImplementation(() => {
        throw new Error('DB unavailable');
      });

      await getTemplateFromRefresh();

      // Should still build menu without crashing
      expect(mockBuildFromTemplate).toHaveBeenCalled();
    });

    it('should hide window and dock when hide-to-tray is clicked on macOS', async () => {
      setupWithOverrides();
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const { setTrayMainWindow } = await import('@process/utils/tray');
      const mockWindow = createMockWindow();
      setTrayMainWindow(mockWindow);

      const templateArg = await getTemplateFromRefresh();
      const hideToTrayItem = templateArg.find((item: any) => item.label === 'common.tray.closeToTray');

      hideToTrayItem.click();

      expect(mockWindow.hide).toHaveBeenCalledOnce();
      expect(mockDock.hide).toHaveBeenCalledOnce();
    });

    it('should restore window and show dock when show-window is clicked on macOS', async () => {
      setupWithOverrides();
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const { setTrayMainWindow } = await import('@process/utils/tray');
      const mockWindow = createMockWindow();
      mockWindow.isMinimized.mockReturnValue(true);
      setTrayMainWindow(mockWindow);

      const templateArg = await getTemplateFromRefresh();
      const showWindowItem = templateArg.find((item: any) => item.label === 'common.tray.showWindow');

      showWindowItem.click();

      expect(mockDock.show).toHaveBeenCalledOnce();
      expect(mockWindow.restore).toHaveBeenCalledOnce();
      expect(mockWindow.show).toHaveBeenCalledOnce();
      expect(mockWindow.focus).toHaveBeenCalledOnce();
    });
  });
});
