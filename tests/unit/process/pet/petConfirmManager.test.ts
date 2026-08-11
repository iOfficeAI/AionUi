import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockWindow = ReturnType<typeof createMockWindow>;

const createdWindows: MockWindow[] = [];
const constructorArgs: unknown[][] = [];
let confirmHook: {
  onAdd: (conversationId: string, data: Record<string, unknown>) => void;
  onUpdate: (conversationId: string, data: Record<string, unknown>) => void;
  onRemove: (conversationId: string, confirmationId: string) => void;
} | null = null;

function createMockWindow() {
  return {
    show: vi.fn(),
    showInactive: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setAlwaysOnTop: vi.fn(),
    getPosition: vi.fn(() => [100, 200]),
    setPosition: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    webContents: {
      on: vi.fn(),
      send: vi.fn(),
    },
  };
}

vi.mock('electron', () => {
  const BW = function BrowserWindow(...args: unknown[]) {
    constructorArgs.push(args);
    const win = createMockWindow();
    createdWindows.push(win);
    return win;
  } as unknown as typeof import('electron').BrowserWindow;

  return {
    app: {
      isPackaged: true,
    },
    BrowserWindow: BW,
    ipcMain: {
      on: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
      getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
      getCursorScreenPoint: vi.fn(() => ({ x: 150, y: 250 })),
    },
  };
});

vi.mock('@process/task/IpcAgentEventEmitter', () => ({
  setConfirmHook: vi.fn((hook) => {
    confirmHook = hook;
  }),
  IpcAgentEventEmitter: vi.fn(() => ({
    emitConfirmationRemove: vi.fn(),
  })),
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    getTask: vi.fn(),
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(() => Promise.resolve('light')),
  },
}));

vi.mock('@process/services/i18n', () => ({
  default: {
    t: vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key),
  },
}));

describe('petConfirmManager', () => {
  let manager: typeof import('@process/pet/petConfirmManager');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    createdWindows.length = 0;
    constructorArgs.length = 0;
    confirmHook = null;
    manager = await import('@process/pet/petConfirmManager');
  });

  afterEach(() => {
    manager.destroyPetConfirmManager();
  });

  it('shows new confirmation windows without activating AionUi', () => {
    manager.initPetConfirmManager({ x: 0, y: 0, width: 100, height: 100 });

    confirmHook?.onAdd('conversation-1', {
      id: 'confirmation-1',
      callId: 'call-1',
      title: 'Confirm',
      description: 'Run this tool?',
      options: [{ label: 'Allow', value: 'allow' }],
    });

    expect(createdWindows).toHaveLength(1);
    expect((constructorArgs[0][0] as Record<string, unknown>).show).toBe(false);
    expect(createdWindows[0].showInactive).toHaveBeenCalledOnce();
    expect(createdWindows[0].show).not.toHaveBeenCalled();
    expect(createdWindows[0].focus).not.toHaveBeenCalled();
  });
});
