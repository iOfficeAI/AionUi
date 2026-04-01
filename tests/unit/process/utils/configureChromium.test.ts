import { afterEach, describe, expect, it, vi } from 'vitest';

type MockApp = {
  isPackaged: boolean;
  commandLine: {
    appendSwitch: ReturnType<typeof vi.fn>;
    hasSwitch: ReturnType<typeof vi.fn>;
    getSwitchValue: ReturnType<typeof vi.fn>;
  };
  getPath: ReturnType<typeof vi.fn>;
  setName: ReturnType<typeof vi.fn>;
  setPath: ReturnType<typeof vi.fn>;
};

const originalArgv = [...process.argv];
const originalDisplay = process.env.DISPLAY;
const originalPlatform = process.platform;

async function loadModuleWithArgs(args: string[], platform: NodeJS.Platform): Promise<MockApp> {
  vi.resetModules();

  process.argv = ['node', 'test-entry', ...args];
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });

  const mockApp: MockApp = {
    isPackaged: true,
    commandLine: {
      appendSwitch: vi.fn(),
      hasSwitch: vi.fn().mockReturnValue(false),
      getSwitchValue: vi.fn().mockReturnValue(''),
    },
    getPath: vi.fn().mockReturnValue('/tmp/aionui-test-userdata'),
    setName: vi.fn(),
    setPath: vi.fn(),
  };

  vi.doMock('electron', () => ({ app: mockApp }));

  await import('../../../../src/process/utils/configureChromium');

  return mockApp;
}

afterEach(() => {
  process.argv = [...originalArgv];
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: originalPlatform,
  });

  if (originalDisplay === undefined) {
    delete process.env.DISPLAY;
  } else {
    process.env.DISPLAY = originalDisplay;
  }

  vi.resetModules();
  vi.clearAllMocks();
});

describe('configureChromium Linux headless flags', () => {
  it('forces headless ozone flags in --webui mode even when DISPLAY exists', async () => {
    process.env.DISPLAY = ':99';

    const mockApp = await loadModuleWithArgs(['--webui'], 'linux');

    expect(mockApp.commandLine.appendSwitch).toHaveBeenCalledWith('ozone-platform', 'headless');
    expect(mockApp.commandLine.appendSwitch).toHaveBeenCalledWith('disable-gpu');
    expect(mockApp.commandLine.appendSwitch).toHaveBeenCalledWith('disable-software-rasterizer');
  });

  it('forces headless ozone flags in --resetpass mode on linux', async () => {
    process.env.DISPLAY = ':99';

    const mockApp = await loadModuleWithArgs(['--resetpass'], 'linux');

    expect(mockApp.commandLine.appendSwitch).toHaveBeenCalledWith('ozone-platform', 'headless');
    expect(mockApp.commandLine.appendSwitch).toHaveBeenCalledWith('disable-gpu');
    expect(mockApp.commandLine.appendSwitch).toHaveBeenCalledWith('disable-software-rasterizer');
  });

  it('does not add headless ozone flags in normal desktop startup', async () => {
    process.env.DISPLAY = ':99';

    const mockApp = await loadModuleWithArgs([], 'linux');

    expect(mockApp.commandLine.appendSwitch).not.toHaveBeenCalledWith('ozone-platform', 'headless');
  });

  it('does not force linux headless flags on non-linux --webui startup', async () => {
    process.env.DISPLAY = ':99';

    const mockApp = await loadModuleWithArgs(['--webui'], 'darwin');

    expect(mockApp.commandLine.appendSwitch).not.toHaveBeenCalledWith('ozone-platform', 'headless');
    expect(mockApp.commandLine.appendSwitch).not.toHaveBeenCalledWith('disable-gpu');
    expect(mockApp.commandLine.appendSwitch).not.toHaveBeenCalledWith('disable-software-rasterizer');
  });
});
