import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerConfig: vi.fn(),
  agentRegistryInitialize: vi.fn(async () => {}),
  sqlChannelRepoCtor: vi.fn(),
  sqlConversationRepoCtor: vi.fn(),
  conversationServiceCtor: vi.fn(),
  applicationBridgeCore: vi.fn(),
  shellBridgeStandalone: vi.fn(),
  fileWatchBridge: vi.fn(),
  fsBridge: vi.fn(),
  conversationBridge: vi.fn(),
  geminiConversationBridge: vi.fn(),
  geminiBridge: vi.fn(),
  bedrockBridge: vi.fn(),
  acpConversationBridge: vi.fn(),
  authBridge: vi.fn(),
  modelBridge: vi.fn(),
  previewHistoryBridge: vi.fn(),
  documentBridge: vi.fn(),
  pptPreviewBridge: vi.fn(),
  officeWatchBridge: vi.fn(),
  channelBridge: vi.fn(),
  databaseBridge: vi.fn(),
  extensionsBridge: vi.fn(),
  systemSettingsBridge: vi.fn(),
  cronBridge: vi.fn(),
  hubBridge: vi.fn(),
  mcpBridge: vi.fn(),
  notificationBridge: vi.fn(),
  remoteAgentBridge: vi.fn(),
  taskBridge: vi.fn(),
  starOfficeBridge: vi.fn(),
  speechToTextBridge: vi.fn(),
  workerTaskManager: {},
}));

vi.mock('@office-ai/platform', () => ({
  logger: {
    config: (...args: unknown[]) => mocks.loggerConfig(...args),
  },
}));

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: {
    initialize: (...args: unknown[]) => mocks.agentRegistryInitialize(...args),
  },
}));

vi.mock('@process/services/database/SqliteChannelRepository', () => ({
  SqliteChannelRepository: vi.fn(function MockSqliteChannelRepository(...args: unknown[]) {
    mocks.sqlChannelRepoCtor(...args);
  }),
}));

vi.mock('@process/services/database/SqliteConversationRepository', () => ({
  SqliteConversationRepository: vi.fn(function MockSqliteConversationRepository(...args: unknown[]) {
    mocks.sqlConversationRepoCtor(...args);
  }),
}));

vi.mock('@process/services/ConversationServiceImpl', () => ({
  ConversationServiceImpl: vi.fn(function MockConversationServiceImpl(...args: unknown[]) {
    mocks.conversationServiceCtor(...args);
  }),
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: mocks.workerTaskManager,
}));

vi.mock('@process/bridge/applicationBridgeCore', () => ({
  initApplicationBridgeCore: (...args: unknown[]) => mocks.applicationBridgeCore(...args),
}));
vi.mock('@process/bridge/shellBridgeStandalone', () => ({
  initShellBridgeStandalone: (...args: unknown[]) => mocks.shellBridgeStandalone(...args),
}));
vi.mock('@process/bridge/fileWatchBridge', () => ({
  initFileWatchBridge: (...args: unknown[]) => mocks.fileWatchBridge(...args),
}));
vi.mock('@process/bridge/fsBridge', () => ({
  initFsBridge: (...args: unknown[]) => mocks.fsBridge(...args),
}));
vi.mock('@process/bridge/conversationBridge', () => ({
  initConversationBridge: (...args: unknown[]) => mocks.conversationBridge(...args),
}));
vi.mock('@process/bridge/geminiConversationBridge', () => ({
  initGeminiConversationBridge: (...args: unknown[]) => mocks.geminiConversationBridge(...args),
}));
vi.mock('@process/bridge/geminiBridge', () => ({
  initGeminiBridge: (...args: unknown[]) => mocks.geminiBridge(...args),
}));
vi.mock('@process/bridge/bedrockBridge', () => ({
  initBedrockBridge: (...args: unknown[]) => mocks.bedrockBridge(...args),
}));
vi.mock('@process/bridge/acpConversationBridge', () => ({
  initAcpConversationBridge: (...args: unknown[]) => mocks.acpConversationBridge(...args),
}));
vi.mock('@process/bridge/authBridge', () => ({
  initAuthBridge: (...args: unknown[]) => mocks.authBridge(...args),
}));
vi.mock('@process/bridge/modelBridge', () => ({
  initModelBridge: (...args: unknown[]) => mocks.modelBridge(...args),
}));
vi.mock('@process/bridge/previewHistoryBridge', () => ({
  initPreviewHistoryBridge: (...args: unknown[]) => mocks.previewHistoryBridge(...args),
}));
vi.mock('@process/bridge/documentBridge', () => ({
  initDocumentBridge: (...args: unknown[]) => mocks.documentBridge(...args),
}));
vi.mock('@process/bridge/pptPreviewBridge', () => ({
  initPptPreviewBridge: (...args: unknown[]) => mocks.pptPreviewBridge(...args),
}));
vi.mock('@process/bridge/officeWatchBridge', () => ({
  initOfficeWatchBridge: (...args: unknown[]) => mocks.officeWatchBridge(...args),
}));
vi.mock('@process/bridge/channelBridge', () => ({
  initChannelBridge: (...args: unknown[]) => mocks.channelBridge(...args),
}));
vi.mock('@process/bridge/databaseBridge', () => ({
  initDatabaseBridge: (...args: unknown[]) => mocks.databaseBridge(...args),
}));
vi.mock('@process/bridge/extensionsBridge', () => ({
  initExtensionsBridge: (...args: unknown[]) => mocks.extensionsBridge(...args),
}));
vi.mock('@process/bridge/systemSettingsBridge', () => ({
  initSystemSettingsBridge: (...args: unknown[]) => mocks.systemSettingsBridge(...args),
}));
vi.mock('@process/bridge/cronBridge', () => ({
  initCronBridge: (...args: unknown[]) => mocks.cronBridge(...args),
}));
vi.mock('@process/bridge/hubBridge', () => ({
  initHubBridge: (...args: unknown[]) => mocks.hubBridge(...args),
}));
vi.mock('@process/bridge/mcpBridge', () => ({
  initMcpBridge: (...args: unknown[]) => mocks.mcpBridge(...args),
}));
vi.mock('@process/bridge/notificationBridge', () => ({
  initNotificationBridge: (...args: unknown[]) => mocks.notificationBridge(...args),
}));
vi.mock('@process/bridge/remoteAgentBridge', () => ({
  initRemoteAgentBridge: (...args: unknown[]) => mocks.remoteAgentBridge(...args),
}));
vi.mock('@process/bridge/taskBridge', () => ({
  initTaskBridge: (...args: unknown[]) => mocks.taskBridge(...args),
}));
vi.mock('@process/bridge/starOfficeBridge', () => ({
  initStarOfficeBridge: (...args: unknown[]) => mocks.starOfficeBridge(...args),
}));
vi.mock('@process/bridge/speechToTextBridge', () => ({
  initSpeechToTextBridge: (...args: unknown[]) => mocks.speechToTextBridge(...args),
}));

import { initBridgeStandalone } from '../../../src/process/utils/initBridgeStandalone';

describe('initBridgeStandalone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes hub and remote agent bridges in standalone mode', async () => {
    await initBridgeStandalone();

    expect(mocks.hubBridge).toHaveBeenCalledTimes(1);
    expect(mocks.remoteAgentBridge).toHaveBeenCalledTimes(1);
    expect(mocks.acpConversationBridge).toHaveBeenCalledWith(mocks.workerTaskManager);
    expect(mocks.agentRegistryInitialize).toHaveBeenCalledTimes(1);
  });
});
