import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Electron mock ──────────────────────────────────────────────────────

type MockWindow = ReturnType<typeof createMockWindow>;
const createdWindows: MockWindow[] = [];
const constructorArgs: unknown[][] = [];

function createMockWindow() {
  return {
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    getPosition: vi.fn(() => [100, 200]),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    webContents: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
  };
}

const mockIpcHandlers = new Map<string, (...args: unknown[]) => void>();

vi.mock('electron', () => {
  // Must use function (not arrow) so it can be called with `new`
  const BW = function BrowserWindow(...args: unknown[]) {
    constructorArgs.push(args);
    const win = createMockWindow();
    createdWindows.push(win);
    return win;
  } as unknown as typeof import('electron').BrowserWindow;
  // computeInitialPosition walks BrowserWindow.getAllWindows() to find the
  // main window so it can place the pet on the same display. In unit tests
  // there's no real main window — returning [] makes the helper fall back
  // to the primary display path.
  (BW as unknown as { getAllWindows: () => unknown[] }).getAllWindows = () => [];

  return {
    app: {
      isPackaged: false,
      commandLine: { getSwitchValue: vi.fn(() => '') },
    },
    BrowserWindow: BW,
    ipcMain: {
      on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        mockIpcHandlers.set(channel, handler);
      }),
      removeAllListeners: vi.fn((channel: string) => {
        mockIpcHandlers.delete(channel);
      }),
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        workAreaSize: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      })),
      // computeInitialPosition resolves the pet's starting display by the
      // main window's center point. In tests no real main window exists, so
      // the candidate lookup returns undefined and we fall back to the
      // primary display — getDisplayNearestPoint still needs to be mockable
      // for the non-test multi-monitor case though.
      getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
      getCursorScreenPoint: vi.fn(() => ({ x: 150, y: 250 })),
    },
  };
});

vi.mock('../../../../src/common/adapter/main', () => ({
  setPetNotifyHook: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────

import {
  createPetWindow,
  destroyPetWindow,
  showPetWindow,
  hidePetWindow,
  getEventBridge,
  isPetSupported,
} from '@process/pet/petManager';
import { app, ipcMain, Menu, screen } from 'electron';
import { setPetNotifyHook } from '../../../../src/common/adapter/main';

describe('petManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset module state by destroying first
    destroyPetWindow();
    // Clear mocks AFTER destroy so test sees only its own calls
    vi.clearAllMocks();
    mockIpcHandlers.clear();
    createdWindows.length = 0;
    constructorArgs.length = 0;
  });

  afterEach(() => {
    destroyPetWindow();
    vi.useRealTimers();
  });

  // ── createPetWindow ────────────────────────────────────────────────

  describe('createPetWindow', () => {
    it('creates two BrowserWindow instances', () => {
      createPetWindow();
      expect(createdWindows).toHaveLength(2);
    });

    it('sets always-on-top for both windows', () => {
      createPetWindow();
      for (const win of createdWindows) {
        expect(win.setAlwaysOnTop).toHaveBeenCalled();
      }
    });

    it('registers IPC handlers for drag, click, context-menu', () => {
      createPetWindow();
      expect(ipcMain.on).toHaveBeenCalledWith('pet:drag-start', expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith('pet:drag-end', expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith('pet:click', expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith('pet:context-menu', expect.any(Function));
    });

    it('sets the pet notify hook', () => {
      createPetWindow();
      expect(setPetNotifyHook).toHaveBeenCalledWith(expect.any(Function));
    });

    it('initializes the event bridge', () => {
      createPetWindow();
      expect(getEventBridge()).not.toBeNull();
    });

    it('does not recreate if already exists and not destroyed', () => {
      createPetWindow();
      const countBefore = createdWindows.length;
      createPetWindow();
      // Should show + focus instead of creating new windows
      expect(createdWindows).toHaveLength(countBefore);
    });

    it('positions windows at bottom-right of screen', () => {
      createPetWindow();
      const petOpts = constructorArgs[0][0] as Record<string, unknown>;
      expect(petOpts.x).toBe(1920 - 280 - 20);
      expect(petOpts.y).toBe(1080 - 280 - 20);
    });

    it('creates hit window at 60% size with 20% offset', () => {
      createPetWindow();
      const hitOpts = constructorArgs[1][0] as Record<string, unknown>;
      expect(hitOpts.width).toBe(Math.round(280 * 0.6));
      expect(hitOpts.height).toBe(Math.round(280 * 0.6));
    });

    it('loads dev server URLs when not packaged', () => {
      process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
      createPetWindow();
      const petWin = createdWindows[0];
      expect(petWin.loadURL).toHaveBeenCalledWith(expect.stringContaining('/pet/pet.html'));
      delete process.env['ELECTRON_RENDERER_URL'];
    });
  });

  // ── destroyPetWindow ───────────────────────────────────────────────

  describe('destroyPetWindow', () => {
    it('clears the pet notify hook', () => {
      createPetWindow();
      vi.clearAllMocks();
      destroyPetWindow();
      expect(setPetNotifyHook).toHaveBeenCalledWith(null);
    });

    it('unregisters IPC handlers', () => {
      createPetWindow();
      destroyPetWindow();
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('pet:drag-start');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('pet:drag-end');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('pet:click');
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('pet:context-menu');
    });

    it('nullifies the event bridge', () => {
      createPetWindow();
      expect(getEventBridge()).not.toBeNull();
      destroyPetWindow();
      expect(getEventBridge()).toBeNull();
    });

    it('is safe to call without prior create', () => {
      expect(() => destroyPetWindow()).not.toThrow();
    });

    it('is safe to call multiple times', () => {
      createPetWindow();
      destroyPetWindow();
      expect(() => destroyPetWindow()).not.toThrow();
    });
  });

  // ── showPetWindow / hidePetWindow ──────────────────────────────────

  describe('showPetWindow', () => {
    it('does not throw when no windows exist', () => {
      expect(() => showPetWindow()).not.toThrow();
    });
  });

  describe('hidePetWindow', () => {
    it('does not throw when no windows exist', () => {
      expect(() => hidePetWindow()).not.toThrow();
    });
  });

  // ── isPetSupported ─────────────────────────────────────────────────

  describe('isPetSupported', () => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
      vi.mocked(app.commandLine.getSwitchValue).mockReturnValue('');
    });

    it('returns false on Linux with ozone-platform=headless', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      vi.mocked(app.commandLine.getSwitchValue).mockReturnValue('headless');
      expect(isPetSupported()).toBe(false);
    });

    it('returns true on Linux without headless ozone', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      vi.mocked(app.commandLine.getSwitchValue).mockReturnValue('');
      expect(isPetSupported()).toBe(true);
    });

    it('returns true on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      expect(isPetSupported()).toBe(true);
    });

    it('returns true on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      expect(isPetSupported()).toBe(true);
    });
  });

  describe('createPetWindow headless guard', () => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
      vi.mocked(app.commandLine.getSwitchValue).mockReturnValue('');
    });

    it('skips window creation when pet is not supported', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      vi.mocked(app.commandLine.getSwitchValue).mockReturnValue('headless');
      const countBefore = createdWindows.length;
      createPetWindow();
      expect(createdWindows).toHaveLength(countBefore);
    });
  });

  // ── IPC: pet:click ─────────────────────────────────────────────────

  describe('IPC: pet:click', () => {
    it('requests attention on single click', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:click');
      handler?.({}, { side: 'left', count: 1 });
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'attention')).toBe(true);
    });

    it('requests poke-left on double left click', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:click');
      handler?.({}, { side: 'left', count: 2 });
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'poke-left')).toBe(true);
    });

    it('requests poke-right on double right click', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:click');
      handler?.({}, { side: 'right', count: 2 });
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'poke-right')).toBe(true);
    });

    // Triple click now falls through to the directional poke (same bucket
    // as a double click) — `error` is reserved exclusively for genuine AI
    // errors so users can tell "I poked the pet" apart from "the agent
    // failed". Four or more rapid clicks escalate to `juggling` (flustered).
    it('requests poke on triple click (no longer error)', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:click');
      handler?.({}, { side: 'left', count: 3 });
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'poke-left')).toBe(true);
      expect(stateChanges.some((c: [string, string]) => c[1] === 'error')).toBe(false);
    });

    it('requests juggling on 4+ rapid clicks', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:click');
      handler?.({}, { side: 'left', count: 4 });
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'juggling')).toBe(true);
    });
  });

  // ── IPC: pet:drag-start / pet:drag-end ─────────────────────────────

  describe('IPC: drag', () => {
    it('sets dragging state on drag-start', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:drag-start');
      handler?.();
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'dragging')).toBe(true);
    });

    it('returns to idle on drag-end', () => {
      createPetWindow();
      const startHandler = mockIpcHandlers.get('pet:drag-start');
      const endHandler = mockIpcHandlers.get('pet:drag-end');
      startHandler?.();
      endHandler?.();
      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      const lastState = stateChanges[stateChanges.length - 1]?.[1];
      expect(lastState).toBe('idle');
    });

    it('updates window position during drag', () => {
      createPetWindow();
      const petWin = createdWindows[0];
      const hitWin = createdWindows[1];

      const startHandler = mockIpcHandlers.get('pet:drag-start');
      startHandler?.();

      // Simulate cursor move
      vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 200, y: 300 });
      vi.advanceTimersByTime(16);

      expect(petWin.setPosition).toHaveBeenCalled();
      expect(hitWin.setPosition).toHaveBeenCalled();

      // Clean up drag timer
      const endHandler = mockIpcHandlers.get('pet:drag-end');
      endHandler?.();
    });
  });

  // ── IPC: pet:context-menu ──────────────────────────────────────────

  describe('IPC: pet:context-menu', () => {
    it('builds and shows a context menu', () => {
      createPetWindow();
      const handler = mockIpcHandlers.get('pet:context-menu');
      handler?.();
      expect(Menu.buildFromTemplate).toHaveBeenCalled();
    });
  });

  // ── petNotifyHook integration ──────────────────────────────────────

  describe('petNotifyHook', () => {
    it('forwards bridge events to the event bridge', () => {
      createPetWindow();
      const hookCall = vi.mocked(setPetNotifyHook).mock.calls[0];
      const hook = hookCall[0] as (name: string, data: unknown) => void;

      hook('chat.response.stream', { type: 'thinking' });

      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'thinking')).toBe(true);
    });

    it('forwards confirmation.add to notification state', () => {
      createPetWindow();
      const hookCall = vi.mocked(setPetNotifyHook).mock.calls[0];
      const hook = hookCall[0] as (name: string, data: unknown) => void;

      hook('confirmation.add', {});

      const sendCalls = createdWindows[0].webContents.send.mock.calls;
      const stateChanges = sendCalls.filter((c: [string, ...unknown[]]) => c[0] === 'pet:state-changed');
      expect(stateChanges.some((c: [string, string]) => c[1] === 'notification')).toBe(true);
    });
  });
});
