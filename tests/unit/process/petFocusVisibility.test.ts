import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

class MockBrowserWindow {
  static windows: MockBrowserWindow[] = [];

  readonly listeners = new Map<string, Set<Listener>>();
  readonly webContents = { send: vi.fn() };
  readonly show = vi.fn();
  readonly hide = vi.fn();
  isFocusedValue = false;
  destroyed = false;

  constructor(_options: unknown) {
    MockBrowserWindow.windows.push(this);
  }

  static getAllWindows() {
    return MockBrowserWindow.windows;
  }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeListener(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string) {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  isDestroyed() {
    return this.destroyed;
  }

  isFocused() {
    return this.isFocusedValue;
  }

  setAlwaysOnTop() {}
  setIgnoreMouseEvents() {}
  getPosition() {
    return [0, 0] as const;
  }
  getSize() {
    return [280, 280] as const;
  }
  loadFile() {
    return Promise.resolve();
  }
  loadURL() {
    return Promise.resolve();
  }
  destroy() {
    this.destroyed = true;
  }
}

const { configGet } = vi.hoisted(() => ({ configGet: vi.fn() }));

vi.mock('electron', () => ({
  app: { commandLine: { getSwitchValue: vi.fn(() => '') }, isPackaged: true },
  BrowserWindow: MockBrowserWindow,
  ipcMain: { on: vi.fn(), removeAllListeners: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
  },
}));
vi.mock('@process/utils/initStorage', () => ({ ProcessConfig: { get: configGet } }));
vi.mock('@/common/adapter/main', () => ({ setPetNotifyHook: vi.fn() }));
vi.mock('@process/pet/petConfirmManager', () => ({
  destroyPetConfirmManager: vi.fn(),
  initPetConfirmManager: vi.fn(),
  unhookPetConfirm: vi.fn(),
  updateAnchorBounds: vi.fn(),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('pet focus visibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    MockBrowserWindow.windows = [];
    configGet.mockImplementation((key: string) =>
      Promise.resolve(key === 'pet.enabled' || key === 'pet.hideWhenMainWindowFocused')
    );
  });

  afterEach(async () => {
    const { destroyPetWindow } = await import('@process/pet/petManager');
    destroyPetWindow();
  });

  it('hides both pet windows on focus and restores them on blur', async () => {
    const { attachPetFocusVisibility, createPetWindow } = await import('@process/pet/petManager');
    const mainWindow = new MockBrowserWindow({});
    createPetWindow();
    const [petWindow, petHitWindow] = MockBrowserWindow.windows.slice(1);
    attachPetFocusVisibility(mainWindow as never);
    await flush();
    petWindow.hide.mockClear();
    petHitWindow.hide.mockClear();
    petWindow.show.mockClear();
    petHitWindow.show.mockClear();

    mainWindow.isFocusedValue = true;
    mainWindow.emit('focus');
    await flush();
    expect(petWindow.hide).toHaveBeenCalledOnce();
    expect(petHitWindow.hide).toHaveBeenCalledOnce();

    mainWindow.isFocusedValue = false;
    mainWindow.emit('blur');
    await flush();
    expect(petWindow.show).toHaveBeenCalledOnce();
    expect(petHitWindow.show).toHaveBeenCalledOnce();
  });

  it('does not create or change pet windows when Desktop Pet is disabled', async () => {
    configGet.mockResolvedValue(false);
    const { attachPetFocusVisibility } = await import('@process/pet/petManager');
    const mainWindow = new MockBrowserWindow({});
    attachPetFocusVisibility(mainWindow as never);

    mainWindow.isFocusedValue = true;
    mainWindow.emit('focus');
    await flush();

    expect(MockBrowserWindow.windows).toHaveLength(1);
  });

  it('applies setting changes immediately while the main window is focused', async () => {
    const { applyPetFocusVisibilitySetting, attachPetFocusVisibility, createPetWindow } =
      await import('@process/pet/petManager');
    const mainWindow = new MockBrowserWindow({});
    createPetWindow();
    const [petWindow, petHitWindow] = MockBrowserWindow.windows.slice(1);
    attachPetFocusVisibility(mainWindow as never);
    await flush();
    petWindow.hide.mockClear();
    petHitWindow.hide.mockClear();
    petWindow.show.mockClear();
    petHitWindow.show.mockClear();
    mainWindow.isFocusedValue = true;

    applyPetFocusVisibilitySetting(true);
    expect(petWindow.hide).toHaveBeenCalledOnce();
    expect(petHitWindow.hide).toHaveBeenCalledOnce();

    applyPetFocusVisibilitySetting(false);
    expect(petWindow.show).toHaveBeenCalledOnce();
    expect(petHitWindow.show).toHaveBeenCalledOnce();
  });

  it('replaces listeners when the main window is recreated', async () => {
    const { attachPetFocusVisibility, createPetWindow } = await import('@process/pet/petManager');
    createPetWindow();
    const petWindow = MockBrowserWindow.windows[0];
    const firstMainWindow = new MockBrowserWindow({});
    const secondMainWindow = new MockBrowserWindow({});
    attachPetFocusVisibility(firstMainWindow as never);
    attachPetFocusVisibility(secondMainWindow as never);
    await flush();
    petWindow.hide.mockClear();

    firstMainWindow.isFocusedValue = true;
    firstMainWindow.emit('focus');
    await flush();
    expect(petWindow.hide).not.toHaveBeenCalled();

    secondMainWindow.isFocusedValue = true;
    secondMainWindow.emit('focus');
    await flush();
    expect(petWindow.hide).toHaveBeenCalledOnce();
  });
});
