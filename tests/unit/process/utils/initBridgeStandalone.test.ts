import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initApplicationBridgeCore: vi.fn(),
  initShellBridgeStandalone: vi.fn(),
  initFileWatchBridge: vi.fn(),
  initFsBridge: vi.fn(),
  initConversationBridge: vi.fn(),
  initGeminiConversationBridge: vi.fn(),
  initGeminiBridge: vi.fn(),
  initBedrockBridge: vi.fn(),
  initAcpConversationBridge: vi.fn(),
  initAuthBridge: vi.fn(),
  initModelBridge: vi.fn(),
  initPreviewHistoryBridge: vi.fn(),
  initDocumentBridge: vi.fn(),
  initPptPreviewBridge: vi.fn(),
  initOfficeWatchBridge: vi.fn(),
  initChannelBridge: vi.fn(),
  initDatabaseBridge: vi.fn(),
  initExtensionsBridge: vi.fn(),
  initSystemSettingsBridge: vi.fn(),
  initCronBridge: vi.fn(),
  initMcpBridge: vi.fn(),
  initNotificationBridge: vi.fn(),
  initTaskBridge: vi.fn(),
  initStarOfficeBridge: vi.fn(),
  initSpeechToTextBridge: vi.fn(),
  initHubBridge: vi.fn(),
  initializeRegistry: vi.fn(async () => {}),
  loggerConfig: vi.fn(),
}));

vi.mock('@office-ai/platform', () => ({
  logger: {
    config: (...args: unknown[]) => mocks.loggerConfig(...args),
  },
}));

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: {
    initialize: (...args: unknown[]) => mocks.initializeRegistry(...args),
  },
}));

vi.mock('@process/services/database/SqliteChannelRepository', () => ({
  SqliteChannelRepository: class {},
}));

vi.mock('@process/services/database/SqliteConversationRepository', () => ({
  SqliteConversationRepository: class {},
}));

vi.mock('@process/services/ConversationServiceImpl', () => ({
  ConversationServiceImpl: class {},
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {},
}));

vi.mock('@process/bridge/applicationBridgeCore', () => ({
  initApplicationBridgeCore: (...args: unknown[]) => mocks.initApplicationBridgeCore(...args),
}));
vi.mock('@process/bridge/shellBridgeStandalone', () => ({
  initShellBridgeStandalone: (...args: unknown[]) => mocks.initShellBridgeStandalone(...args),
}));
vi.mock('@process/bridge/fileWatchBridge', () => ({
  initFileWatchBridge: (...args: unknown[]) => mocks.initFileWatchBridge(...args),
}));
vi.mock('@process/bridge/fsBridge', () => ({
  initFsBridge: (...args: unknown[]) => mocks.initFsBridge(...args),
}));
vi.mock('@process/bridge/conversationBridge', () => ({
  initConversationBridge: (...args: unknown[]) => mocks.initConversationBridge(...args),
}));
vi.mock('@process/bridge/geminiConversationBridge', () => ({
  initGeminiConversationBridge: (...args: unknown[]) => mocks.initGeminiConversationBridge(...args),
}));
vi.mock('@process/bridge/geminiBridge', () => ({
  initGeminiBridge: (...args: unknown[]) => mocks.initGeminiBridge(...args),
}));
vi.mock('@process/bridge/bedrockBridge', () => ({
  initBedrockBridge: (...args: unknown[]) => mocks.initBedrockBridge(...args),
}));
vi.mock('@process/bridge/acpConversationBridge', () => ({
  initAcpConversationBridge: (...args: unknown[]) => mocks.initAcpConversationBridge(...args),
}));
vi.mock('@process/bridge/authBridge', () => ({
  initAuthBridge: (...args: unknown[]) => mocks.initAuthBridge(...args),
}));
vi.mock('@process/bridge/modelBridge', () => ({
  initModelBridge: (...args: unknown[]) => mocks.initModelBridge(...args),
}));
vi.mock('@process/bridge/previewHistoryBridge', () => ({
  initPreviewHistoryBridge: (...args: unknown[]) => mocks.initPreviewHistoryBridge(...args),
}));
vi.mock('@process/bridge/documentBridge', () => ({
  initDocumentBridge: (...args: unknown[]) => mocks.initDocumentBridge(...args),
}));
vi.mock('@process/bridge/pptPreviewBridge', () => ({
  initPptPreviewBridge: (...args: unknown[]) => mocks.initPptPreviewBridge(...args),
}));
vi.mock('@process/bridge/officeWatchBridge', () => ({
  initOfficeWatchBridge: (...args: unknown[]) => mocks.initOfficeWatchBridge(...args),
}));
vi.mock('@process/bridge/channelBridge', () => ({
  initChannelBridge: (...args: unknown[]) => mocks.initChannelBridge(...args),
}));
vi.mock('@process/bridge/databaseBridge', () => ({
  initDatabaseBridge: (...args: unknown[]) => mocks.initDatabaseBridge(...args),
}));
vi.mock('@process/bridge/extensionsBridge', () => ({
  initExtensionsBridge: (...args: unknown[]) => mocks.initExtensionsBridge(...args),
}));
vi.mock('@process/bridge/systemSettingsBridge', () => ({
  initSystemSettingsBridge: (...args: unknown[]) => mocks.initSystemSettingsBridge(...args),
}));
vi.mock('@process/bridge/cronBridge', () => ({
  initCronBridge: (...args: unknown[]) => mocks.initCronBridge(...args),
}));
vi.mock('@process/bridge/mcpBridge', () => ({
  initMcpBridge: (...args: unknown[]) => mocks.initMcpBridge(...args),
}));
vi.mock('@process/bridge/notificationBridge', () => ({
  initNotificationBridge: (...args: unknown[]) => mocks.initNotificationBridge(...args),
}));
vi.mock('@process/bridge/taskBridge', () => ({
  initTaskBridge: (...args: unknown[]) => mocks.initTaskBridge(...args),
}));
vi.mock('@process/bridge/starOfficeBridge', () => ({
  initStarOfficeBridge: (...args: unknown[]) => mocks.initStarOfficeBridge(...args),
}));
vi.mock('@process/bridge/speechToTextBridge', () => ({
  initSpeechToTextBridge: (...args: unknown[]) => mocks.initSpeechToTextBridge(...args),
}));
vi.mock('@process/bridge/hubBridge', () => ({
  initHubBridge: (...args: unknown[]) => mocks.initHubBridge(...args),
}));

describe('initBridgeStandalone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the hub bridge and initializes ACP detection', async () => {
    const mod = await import('../../../../src/process/utils/initBridgeStandalone');

    await mod.initBridgeStandalone();

    expect(mocks.initHubBridge).toHaveBeenCalledTimes(1);
    expect(mocks.initializeRegistry).toHaveBeenCalledTimes(1);
  });
});
