import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('initializeProcess', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers the API callback manager during process startup', async () => {
    const initStorageMock = vi.fn(async () => {});
    const extensionInitializeMock = vi.fn(async () => {});
    const channelInitializeMock = vi.fn(async () => {});
    const callbackManagerGetInstanceMock = vi.fn(() => ({}));

    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
      },
    }));
    vi.doMock('@/common/platform/register-electron', () => ({}));
    vi.doMock('@process/utils/configureChromium', () => ({}));
    vi.doMock('../../../src/process/utils/initStorage', () => ({
      default: initStorageMock,
    }));
    vi.doMock('../../../src/process/utils/initBridge', () => ({}));
    vi.doMock('../../../src/process/services/i18n', () => ({}));
    vi.doMock('@process/extensions', () => ({
      ExtensionRegistry: {
        getInstance: vi.fn(() => ({
          initialize: extensionInitializeMock,
        })),
      },
    }));
    vi.doMock('@process/channels', () => ({
      getChannelManager: vi.fn(() => ({
        initialize: channelInitializeMock,
      })),
    }));
    vi.doMock('@process/services/ApiCallbackManager', () => ({
      ApiCallbackManager: {
        getInstance: callbackManagerGetInstanceMock,
      },
    }));

    const { initializeProcess } = await import('../../../src/process');
    await initializeProcess();

    expect(initStorageMock).toHaveBeenCalledTimes(1);
    expect(callbackManagerGetInstanceMock).toHaveBeenCalledTimes(1);
    expect(extensionInitializeMock).toHaveBeenCalledTimes(1);
    expect(channelInitializeMock).toHaveBeenCalledTimes(1);
    expect(initStorageMock.mock.invocationCallOrder[0]).toBeLessThan(
      callbackManagerGetInstanceMock.mock.invocationCallOrder[0]
    );
  });

  it('continues startup when extension initialization fails after registering callbacks', async () => {
    const initStorageMock = vi.fn(async () => {});
    const extensionInitializeMock = vi.fn(async () => {
      throw new Error('extension init failed');
    });
    const channelInitializeMock = vi.fn(async () => {});
    const callbackManagerGetInstanceMock = vi.fn(() => ({}));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
      },
    }));
    vi.doMock('@/common/platform/register-electron', () => ({}));
    vi.doMock('@process/utils/configureChromium', () => ({}));
    vi.doMock('../../../src/process/utils/initStorage', () => ({
      default: initStorageMock,
    }));
    vi.doMock('../../../src/process/utils/initBridge', () => ({}));
    vi.doMock('../../../src/process/services/i18n', () => ({}));
    vi.doMock('@process/extensions', () => ({
      ExtensionRegistry: {
        getInstance: vi.fn(() => ({
          initialize: extensionInitializeMock,
        })),
      },
    }));
    vi.doMock('@process/channels', () => ({
      getChannelManager: vi.fn(() => ({
        initialize: channelInitializeMock,
      })),
    }));
    vi.doMock('@process/services/ApiCallbackManager', () => ({
      ApiCallbackManager: {
        getInstance: callbackManagerGetInstanceMock,
      },
    }));

    const { initializeProcess } = await import('../../../src/process');
    await expect(initializeProcess()).resolves.toBeUndefined();

    expect(callbackManagerGetInstanceMock).toHaveBeenCalledTimes(1);
    expect(channelInitializeMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Process] Failed to initialize ExtensionRegistry:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
