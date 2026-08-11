import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const originalArgv = [...process.argv];
const processEventNames = ['exit', 'SIGINT', 'SIGTERM'] as const;

let initialProcessListeners = new Map<(typeof processEventNames)[number], Function[]>();

type ServerTestSetupOptions = {
  extensionInitError?: Error;
};

const setupServerModuleMocks = (options: ServerTestSetupOptions = {}) => {
  const initStorageMock = vi.fn(async () => {});
  const extensionInitializeMock = vi.fn(async () => {
    if (options.extensionInitError) {
      throw options.extensionInitError;
    }
  });
  const channelInitializeMock = vi.fn(async () => {});
  const channelShutdownMock = vi.fn(async () => {});
  const initBridgeStandaloneMock = vi.fn(async () => {});
  const startWebServerWithInstanceMock = vi.fn(async () => ({
    server: {
      close: vi.fn(),
    },
    wss: {
      clients: new Set(),
      close: vi.fn(),
    },
  }));
  const callbackManagerGetInstanceMock = vi.fn(() => ({}));
  const closeDatabaseMock = vi.fn();

  vi.doMock('../../../src/common/platform/register-node', () => ({}));
  vi.doMock('../../../src/common/adapter/standalone', () => ({}));
  vi.doMock('../../../src/process/services/database/export', () => ({
    closeDatabase: closeDatabaseMock,
  }));
  vi.doMock('../../../src/process/utils/initStorage', () => ({
    default: initStorageMock,
  }));
  vi.doMock('../../../src/process/extensions', () => ({
    ExtensionRegistry: {
      getInstance: vi.fn(() => ({
        initialize: extensionInitializeMock,
      })),
    },
  }));
  vi.doMock('../../../src/process/channels', () => ({
    getChannelManager: vi.fn(() => ({
      initialize: channelInitializeMock,
      shutdown: channelShutdownMock,
    })),
  }));
  vi.doMock('../../../src/process/utils/initBridgeStandalone', () => ({
    initBridgeStandalone: initBridgeStandaloneMock,
  }));
  vi.doMock('../../../src/process/webserver', () => ({
    startWebServerWithInstance: startWebServerWithInstanceMock,
  }));
  vi.doMock('../../../src/process/webserver/adapter', () => ({
    cleanupWebAdapter: vi.fn(),
  }));
  vi.doMock('../../../src/process/services/ApiCallbackManager', () => ({
    ApiCallbackManager: {
      getInstance: callbackManagerGetInstanceMock,
    },
  }));

  return {
    callbackManagerGetInstanceMock,
    channelInitializeMock,
    extensionInitializeMock,
    initBridgeStandaloneMock,
    initStorageMock,
    startWebServerWithInstanceMock,
  };
};

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.argv = [...originalArgv];
  initialProcessListeners = new Map(processEventNames.map((eventName) => [eventName, process.listeners(eventName)]));
});

afterEach(() => {
  for (const eventName of processEventNames) {
    const baselineListeners = initialProcessListeners.get(eventName) ?? [];
    for (const listener of process.listeners(eventName)) {
      if (!baselineListeners.includes(listener)) {
        process.removeListener(eventName, listener);
      }
    }
  }

  process.argv = [...originalArgv];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('registers the API callback manager during standalone server startup', async () => {
  const {
    callbackManagerGetInstanceMock,
    channelInitializeMock,
    extensionInitializeMock,
    initBridgeStandaloneMock,
    initStorageMock,
    startWebServerWithInstanceMock,
  } = setupServerModuleMocks();

  vi.stubEnv('ALLOW_REMOTE', 'true');
  vi.stubEnv('PORT', '4321');
  process.argv = ['bun', 'src/server.ts'];

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  await import('../../../src/server');

  await vi.waitFor(() => {
    expect(startWebServerWithInstanceMock).toHaveBeenCalledTimes(1);
  });

  expect(initStorageMock).toHaveBeenCalledTimes(1);
  expect(callbackManagerGetInstanceMock).toHaveBeenCalledTimes(1);
  expect(extensionInitializeMock).toHaveBeenCalledTimes(1);
  expect(channelInitializeMock).toHaveBeenCalledTimes(1);
  expect(initBridgeStandaloneMock).toHaveBeenCalledTimes(1);
  expect(startWebServerWithInstanceMock).toHaveBeenCalledWith(4321, true);
  expect(initStorageMock.mock.invocationCallOrder[0]).toBeLessThan(
    callbackManagerGetInstanceMock.mock.invocationCallOrder[0]
  );
  expect(callbackManagerGetInstanceMock.mock.invocationCallOrder[0]).toBeLessThan(
    startWebServerWithInstanceMock.mock.invocationCallOrder[0]
  );
});

it('continues standalone startup when extension initialization fails after registering callbacks', async () => {
  const extensionInitError = new Error('extension init failed');
  const { callbackManagerGetInstanceMock, startWebServerWithInstanceMock } = setupServerModuleMocks({
    extensionInitError,
  });

  vi.stubEnv('ALLOW_REMOTE', 'false');
  vi.stubEnv('PORT', '3000');
  process.argv = ['bun', 'src/server.ts'];

  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  await import('../../../src/server');

  await vi.waitFor(() => {
    expect(startWebServerWithInstanceMock).toHaveBeenCalledTimes(1);
  });

  expect(callbackManagerGetInstanceMock).toHaveBeenCalledTimes(1);
  expect(consoleErrorSpy).toHaveBeenCalledWith('[server] Failed to initialize ExtensionRegistry:', extensionInitError);
  expect(consoleLogSpy).toHaveBeenCalledWith('[server] WebUI running on http://localhost:3000');
});
