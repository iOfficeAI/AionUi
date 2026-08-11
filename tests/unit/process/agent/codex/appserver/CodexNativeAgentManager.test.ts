import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { CodexNativeAgentManager } from '@/process/agent/codex/appserver/CodexNativeAgentManager';
import type { CodexJsonRpcRequest, CodexServerRequestHandler } from '@/process/agent/codex/appserver/types';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

const testDoubles = vi.hoisted(() => {
  const createDeferred = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };

  const state = {
    clientStartGate: undefined as ReturnType<typeof createDeferred> | undefined,
    clients: [] as unknown[],
    failureListeners: new Set<(error: Error) => void>(),
    modelInfos: [] as unknown[],
    modelServiceInstances: [] as unknown[],
    sessionStartGate: undefined as ReturnType<typeof createDeferred> | undefined,
    sessions: [] as unknown[],
    turnGates: [] as ReturnType<typeof createDeferred>[],
    sessionOptions: [] as Array<Record<string, unknown>>,
  };
  const execFileSync = vi.fn();
  const readCodexConfiguredModel = vi.fn<() => string | undefined>(() => undefined);
  const dbGetConversation = vi.fn();
  const dbUpdateConversation = vi.fn();
  const getDatabase = vi.fn(async () => ({
    getConversation: dbGetConversation,
    updateConversation: dbUpdateConversation,
  }));

  class FakeCodexAppServerClient {
    readonly options: { command: string; args: string[]; cwd?: string };
    serverRequestHandler: CodexServerRequestHandler | undefined;

    constructor(options: { command: string; args: string[]; cwd?: string }) {
      this.options = options;
      state.clients.push(this);
    }

    start = vi.fn(async () => {
      await state.clientStartGate?.promise;
    });

    onFailure = vi.fn((handler: (error: Error) => void) => {
      state.failureListeners.add(handler);
      return () => state.failureListeners.delete(handler);
    });

    onServerRequest = vi.fn((handler: CodexServerRequestHandler) => {
      this.serverRequestHandler = handler;
    });

    emitFailure(error: Error): void {
      for (const listener of state.failureListeners) {
        listener(error);
      }
    }

    dispose = vi.fn(async () => {});
  }

  class FakeCodexModelService {
    selectedModelId: string | undefined;
    modelInfo: {
      currentModelId: string;
      currentModelLabel: string;
      availableModels: Array<{
        id: string;
        label: string;
        supportedReasoningEfforts?: string[];
        defaultReasoningEffort?: string;
      }>;
      canSwitch: boolean;
      source: 'models';
      sourceDetail: 'codex-stream';
    };

    constructor(_client: unknown, selectedModelId?: string) {
      this.selectedModelId = selectedModelId;
      const currentModelId = selectedModelId || 'gpt-5.2-codex';
      this.modelInfo = {
        currentModelId,
        currentModelLabel: currentModelId,
        availableModels: [
          { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
          { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        ],
        canSwitch: true,
        source: 'models',
        sourceDetail: 'codex-stream',
      };
      state.modelServiceInstances.push(this);
    }

    refresh = vi.fn(async () => {
      const nextModelInfo = state.modelInfos.shift();
      if (nextModelInfo) {
        this.modelInfo = nextModelInfo as typeof this.modelInfo;
        this.selectedModelId = this.modelInfo.currentModelId;
      }
      return this.modelInfo;
    });

    getModelInfo = vi.fn(() => this.modelInfo);

    selectModel = vi.fn((modelId: string) => {
      this.selectedModelId = modelId;
      this.modelInfo = {
        ...this.modelInfo,
        currentModelId: modelId,
        currentModelLabel: modelId,
      };
      return this.modelInfo;
    });
  }

  class FakeCodexThreadSession {
    private turnInFlight = false;

    constructor(deps: { options: Record<string, unknown> }) {
      state.sessions.push(this);
      state.sessionOptions.push(deps.options);
    }

    start = vi.fn(async () => {
      await state.sessionStartGate?.promise;
    });

    startTurn = vi.fn(async () => {
      if (this.turnInFlight) {
        throw new Error('Cannot start a new Codex turn while another turn is running');
      }
      this.turnInFlight = true;
      const turnGate = createDeferred();
      state.turnGates.push(turnGate);
      try {
        await turnGate.promise;
      } finally {
        this.turnInFlight = false;
      }
    });

    interrupt = vi.fn(async () => {
      state.turnGates.at(-1)?.resolve();
    });

    updateRuntimeConfig = vi.fn();

    dispose = vi.fn(() => {
      state.turnGates.at(-1)?.resolve();
    });
  }

  return {
    createDeferred,
    FakeCodexAppServerClient,
    FakeCodexModelService,
    FakeCodexThreadSession,
    execFileSync,
    readCodexConfiguredModel,
    dbGetConversation,
    dbUpdateConversation,
    getDatabase,
    state,
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFileSync: testDoubles.execFileSync,
  };
});

vi.mock('@/process/agent/codex/appserver/CodexAppServerClient', () => ({
  CodexAppServerClient: testDoubles.FakeCodexAppServerClient,
}));

vi.mock('@/process/agent/codex/appserver/CodexThreadSession', () => ({
  CodexThreadSession: testDoubles.FakeCodexThreadSession,
  isCodexModelUnavailableError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    (error as { kind?: unknown }).kind === 'model_unavailable',
}));

vi.mock('@/process/agent/codex/appserver/CodexModelService', () => ({
  CodexModelService: testDoubles.FakeCodexModelService,
}));

vi.mock('@/process/agent/codex/appserver/codexCliConfig', () => ({
  readCodexConfiguredModel: testDoubles.readCodexConfiguredModel,
}));

vi.mock('@process/services/database', () => ({
  getDatabase: testDoubles.getDatabase,
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (content: string) => ({ content, loadedSkills: [] })),
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
}));

type FakeClient = {
  start: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  options: { command: string; args: string[]; cwd?: string };
  serverRequestHandler?: CodexServerRequestHandler;
  emitFailure: (error: Error) => void;
};

type FakeSession = {
  start: ReturnType<typeof vi.fn>;
  startTurn: ReturnType<typeof vi.fn>;
};

type StartableManager = {
  ensureStarted: () => Promise<void>;
};

type PersistableManager = {
  emitAndPersistMessage: (message: IResponseMessage, persist: boolean) => void;
};

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForTurnStart(turnCount = 1): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (testDoubles.state.turnGates.length >= turnCount) return;
    await flushPromises();
  }
  throw new Error('Timed out waiting for Codex turn to start');
}

function createManager(conversationId: string): CodexNativeAgentManager {
  return new CodexNativeAgentManager({
    conversation_id: conversationId,
    workspace: process.cwd(),
    appServerCommand: process.execPath,
    appServerArgs: ['tests/fixtures/fake-codex-app-server/index.js'],
    sessionMode: 'default',
  });
}

describe('CodexNativeAgentManager', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    cronBusyGuard.clear();
    testDoubles.state.clientStartGate = undefined;
    testDoubles.state.clients.length = 0;
    testDoubles.state.failureListeners.clear();
    testDoubles.state.modelInfos.length = 0;
    testDoubles.state.modelServiceInstances.length = 0;
    testDoubles.state.sessionStartGate = undefined;
    testDoubles.state.sessions.length = 0;
    testDoubles.state.sessionOptions.length = 0;
    testDoubles.state.turnGates.length = 0;
    vi.clearAllMocks();
    testDoubles.readCodexConfiguredModel.mockReturnValue(undefined);
    testDoubles.dbGetConversation.mockReturnValue({ success: false });
  });

  it('resolves the default Codex command through the login shell', () => {
    testDoubles.execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[1] === 'command -v codex') return '/home/linuxbrew/.linuxbrew/bin/codex\n';
      return 'codex-cli 0.125.0\n';
    });

    const manager = new CodexNativeAgentManager({
      conversation_id: 'conversation-login-shell-codex',
      workspace: process.cwd(),
      cliPath: 'codex',
      sessionMode: 'default',
    });

    const client = testDoubles.state.clients[0] as FakeClient;

    expect(client.options).toMatchObject({
      command: '/home/linuxbrew/.linuxbrew/bin/codex',
      args: ['app-server'],
      cwd: process.cwd(),
    });
    expect(testDoubles.execFileSync).toHaveBeenCalledWith(
      expect.any(String),
      ['-lc', 'command -v codex'],
      expect.objectContaining({ encoding: 'utf8', timeout: expect.any(Number) })
    );

    manager.kill();
  });

  it('uses an explicit Codex path without login shell or version probes', () => {
    vi.stubEnv('PATH', '/home/taichu/.nvm/versions/node/v22.12.0/bin:/home/linuxbrew/.linuxbrew/bin:/usr/bin');
    testDoubles.execFileSync.mockImplementation((command: string, args: string[]) => {
      if (args[1] === 'command -v codex') return '/home/linuxbrew/.linuxbrew/bin/codex\n';
      throw new Error(`Unexpected command probe: ${command}`);
    });

    const manager = new CodexNativeAgentManager({
      conversation_id: 'conversation-nvm-codex',
      workspace: process.cwd(),
      cliPath: '/home/taichu/.nvm/versions/node/v22.12.0/bin/codex',
      sessionMode: 'default',
    });

    const client = testDoubles.state.clients[0] as FakeClient;

    expect(client.options.command).toBe('/home/taichu/.nvm/versions/node/v22.12.0/bin/codex');
    expect(testDoubles.execFileSync).not.toHaveBeenCalledWith(
      expect.any(String),
      ['--version'],
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(testDoubles.execFileSync).not.toHaveBeenCalled();

    manager.kill();
  });

  it('implements the task manager contract for native Codex', async () => {
    const manager = createManager('conversation-1');

    const sendPromise = manager.sendMessage({ content: 'hello', msg_id: 'message-1' });
    await waitForTurnStart();
    testDoubles.state.turnGates[0].resolve();
    await sendPromise;

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;

    expect(manager.type).toBe('codex');
    expect(manager.workspace).toBe(process.cwd());
    expect(manager.status).toBe('finished');
    expect(client.start).toHaveBeenCalledTimes(1);
    expect(session.start).toHaveBeenCalledTimes(1);
    expect(session.startTurn).toHaveBeenCalledTimes(1);

    await manager.stop();
    manager.kill();
  });

  it('stops immediately while a Codex turn is still running', async () => {
    const conversationId = 'conversation-stop-running-turn';
    const manager = createManager(conversationId);
    const sendPromise = manager.sendMessage({ content: 'hello', msg_id: 'message-stop' });
    await waitForTurnStart();

    await manager.stop();
    await sendPromise;

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession & { dispose: ReturnType<typeof vi.fn> };
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(manager.status).toBe('finished');
    expect(cronBusyGuard.isProcessing(conversationId)).toBe(false);
  });

  it('emits non-persisted model info after app-server and session startup', async () => {
    const manager = createManager('conversation-model-info');
    const emitSpy = vi.spyOn(ipcBridge.acpConversation.responseStream, 'emit').mockImplementation(() => {});

    const sendPromise = manager.sendMessage({ content: 'hello', msg_id: 'message-1' });
    await waitForTurnStart();
    testDoubles.state.turnGates[0].resolve();
    await sendPromise;

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_model_info',
        conversation_id: 'conversation-model-info',
        msg_id: 'conversation-model-info-model-info',
        data: expect.objectContaining({
          currentModelId: 'gpt-5.2-codex',
          availableModels: expect.arrayContaining([{ id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }]),
        }),
      })
    );

    emitSpy.mockRestore();
    manager.kill();
  });

  it('loads and caches the complete model list before the first Codex turn', async () => {
    const manager = createManager('conversation-model-info-before-turn');
    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;
    const modelService = testDoubles.state.modelServiceInstances[0] as {
      refresh: ReturnType<typeof vi.fn>;
    };

    const firstResult = await manager.loadModelInfo();
    const secondResult = await manager.loadModelInfo();

    expect(firstResult.availableModels).toHaveLength(2);
    expect(secondResult).toEqual(firstResult);
    expect(client.start).toHaveBeenCalledOnce();
    expect(session.start).not.toHaveBeenCalled();
    expect(modelService.refresh).toHaveBeenCalledOnce();

    manager.kill();
  });

  it('exposes Max after loading model-specific Codex reasoning capabilities', async () => {
    testDoubles.state.modelInfos.push({
      currentModelId: 'gpt-5.6-sol',
      currentModelLabel: 'GPT-5.6 Sol',
      availableModels: [
        {
          id: 'gpt-5.6-sol',
          label: 'GPT-5.6 Sol',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
          defaultReasoningEffort: 'low',
        },
      ],
      canSwitch: false,
      source: 'models',
      sourceDetail: 'codex-stream',
    });
    const manager = createManager('conversation-max-capability');

    await manager.loadModelInfo();

    expect(manager.getConfigOptions()[0]).toMatchObject({
      currentValue: 'low',
      options: expect.arrayContaining([
        { value: 'max', name: 'Max' },
        { value: 'ultra', name: 'Ultra' },
      ]),
    });

    await expect(manager.setConfigOption('reasoning_effort', 'max')).resolves.toEqual([
      expect.objectContaining({ currentValue: 'max' }),
    ]);

    manager.kill();
  });

  it('falls back to the next model default when Max is unsupported after a model switch', async () => {
    testDoubles.state.modelInfos.push({
      currentModelId: 'gpt-5.6-sol',
      currentModelLabel: 'GPT-5.6 Sol',
      availableModels: [
        {
          id: 'gpt-5.6-sol',
          label: 'GPT-5.6 Sol',
          supportedReasoningEfforts: ['low', 'medium', 'xhigh', 'max'],
          defaultReasoningEffort: 'low',
        },
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoningEffort: 'medium',
        },
      ],
      canSwitch: true,
      source: 'models',
      sourceDetail: 'codex-stream',
    });
    const manager = createManager('conversation-max-model-switch');

    await manager.loadModelInfo();
    await manager.setConfigOption('reasoning_effort', 'max');
    await manager.setModel('gpt-5.5');

    expect(manager.getConfigOptions()[0]).toMatchObject({
      currentValue: 'medium',
      options: expect.not.arrayContaining([expect.objectContaining({ value: 'max' })]),
    });

    manager.kill();
  });

  it('persists the configured model when resuming a legacy conversation without model fields', async () => {
    testDoubles.readCodexConfiguredModel.mockReturnValue('gpt-5.6-sol');
    testDoubles.dbGetConversation.mockReturnValue({
      success: true,
      data: {
        extra: {
          workspace: process.cwd(),
          codexThreadId: 'thread-existing',
        },
      },
    });
    const manager = new CodexNativeAgentManager({
      conversation_id: 'conversation-legacy-empty-model',
      workspace: process.cwd(),
      codexThreadId: 'thread-existing',
      appServerCommand: process.execPath,
      sessionMode: 'default',
    });

    await (manager as unknown as StartableManager).ensureStarted();

    expect(testDoubles.state.sessionOptions[0]).toMatchObject({
      threadId: 'thread-existing',
      model: 'gpt-5.6-sol',
    });
    expect(testDoubles.dbUpdateConversation).toHaveBeenCalledWith('conversation-legacy-empty-model', {
      extra: expect.objectContaining({
        codexModel: 'gpt-5.6-sol',
        currentModelId: 'gpt-5.6-sol',
      }),
    });

    manager.kill();
  });

  it('persists native assistant text deltas by updating the same message', () => {
    const manager = createManager('conversation-assistant-text-persist');

    (manager as unknown as PersistableManager).emitAndPersistMessage(
      {
        type: 'content',
        conversation_id: 'conversation-assistant-text-persist',
        msg_id: 'assistant-message-1',
        data: 'streaming assistant text',
      },
      true
    );

    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      'conversation-assistant-text-persist',
      expect.objectContaining({
        type: 'text',
        position: 'left',
        msg_id: 'assistant-message-1',
        content: { content: 'streaming assistant text' },
      })
    );
    expect(addMessage).not.toHaveBeenCalled();

    manager.kill();
  });

  it('selects and persists the next Codex model for future turns', async () => {
    const manager = createManager('conversation-select-model');

    await expect(manager.setModel('gpt-5.3-codex')).resolves.toMatchObject({
      currentModelId: 'gpt-5.3-codex',
      currentModelLabel: 'gpt-5.3-codex',
    });
    expect(manager.getModelInfo()).toMatchObject({ currentModelId: 'gpt-5.3-codex' });

    manager.kill();
  });

  it('blocks repeated sends with a provider-rejected model until the user selects a model again', async () => {
    testDoubles.dbGetConversation.mockReturnValue({
      success: true,
      data: { extra: { codexModel: 'provider-model', currentModelId: 'provider-model' } },
    });
    const manager = new CodexNativeAgentManager({
      conversation_id: 'conversation-invalid-model',
      workspace: process.cwd(),
      appServerCommand: process.execPath,
      codexModel: 'provider-model',
      currentModelId: 'provider-model',
      sessionMode: 'default',
    });

    const firstSend = manager.sendMessage({ content: 'first', msg_id: 'message-1' });
    await waitForTurnStart();
    const failure = Object.assign(new Error('Model "provider-model" is not supported by the configured account'), {
      kind: 'model_unavailable',
    });
    testDoubles.state.turnGates[0].reject(failure);
    await expect(firstSend).rejects.toThrow('not supported');

    await expect(manager.sendMessage({ content: 'second', msg_id: 'message-2' })).rejects.toThrow('not supported');
    expect((testDoubles.state.sessions[0] as FakeSession).startTurn).toHaveBeenCalledTimes(1);

    await manager.setModel('provider-model');
    const lastPersistedExtra = testDoubles.dbUpdateConversation.mock.calls.at(-1)?.[1]?.extra;
    expect(lastPersistedExtra).not.toHaveProperty('codexInvalidModelId');
    expect(lastPersistedExtra).not.toHaveProperty('codexInvalidModelError');
    const retry = manager.sendMessage({ content: 'retry', msg_id: 'message-3' });
    await waitForTurnStart(2);
    testDoubles.state.turnGates[1].resolve();
    await retry;

    manager.kill();
  });

  it('restores the rejected-model guard when a conversation is reopened', async () => {
    const manager = new CodexNativeAgentManager({
      conversation_id: 'conversation-persisted-invalid-model',
      workspace: process.cwd(),
      appServerCommand: process.execPath,
      codexModel: 'provider-model',
      currentModelId: 'provider-model',
      codexInvalidModelId: 'provider-model',
      codexInvalidModelError: 'Provider rejected provider-model',
      sessionMode: 'default',
    });

    await expect(manager.sendMessage({ content: 'hello', msg_id: 'message-1' })).rejects.toThrow(
      'Provider rejected provider-model'
    );
    expect((testDoubles.state.clients[0] as FakeClient).start).not.toHaveBeenCalled();
    expect((testDoubles.state.sessions[0] as FakeSession).startTurn).not.toHaveBeenCalled();

    manager.kill();
  });

  it('keeps selecting the current Codex model as a no-op', async () => {
    const manager = createManager('conversation-same-model');
    const modelService = testDoubles.state.modelServiceInstances[0] as {
      selectModel: ReturnType<typeof vi.fn>;
    };
    const emitSpy = vi.spyOn(ipcBridge.acpConversation.responseStream, 'emit').mockImplementation(() => {});

    await expect(manager.setModel('gpt-5.2-codex')).resolves.toMatchObject({
      currentModelId: 'gpt-5.2-codex',
    });

    expect(modelService.selectModel).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();

    emitSpy.mockRestore();
    manager.kill();
  });

  it('updates native Codex mode and reasoning options for future turns', async () => {
    const manager = createManager('conversation-native-config');
    const session = testDoubles.state.sessions[0] as FakeSession & {
      updateRuntimeConfig: ReturnType<typeof vi.fn>;
    };

    expect(manager.getMode()).toMatchObject({ mode: 'default', initialized: false });
    expect(manager.getConfigOptions()).toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'medium',
      }),
    ]);

    await expect(manager.setMode('yoloNoSandbox')).resolves.toMatchObject({
      success: true,
      data: { mode: 'yoloNoSandbox' },
    });
    await expect(manager.setConfigOption('reasoning_effort', 'xhigh')).resolves.toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'xhigh',
      }),
    ]);

    expect(manager.getMode()).toMatchObject({ mode: 'yoloNoSandbox' });
    expect(session.updateRuntimeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: 'never',
        sandboxPolicy: 'danger-full-access',
      })
    );
    expect(session.updateRuntimeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoningEffort: 'xhigh',
      })
    );

    manager.kill();
  });

  it('rejects model changes while a Codex turn is running', async () => {
    const manager = createManager('conversation-running-model-change');
    const modelService = testDoubles.state.modelServiceInstances[0] as {
      selectModel: ReturnType<typeof vi.fn>;
    };

    const firstSend = manager.sendMessage({ content: 'first', msg_id: 'message-1' });
    await waitForTurnStart();

    await expect(manager.setModel('gpt-5.3-codex')).rejects.toThrow(
      'Cannot change Codex model while a turn is running'
    );
    expect(modelService.selectModel).not.toHaveBeenCalled();

    testDoubles.state.turnGates[0].resolve();
    await firstSend;
    manager.kill();
  });

  it('restarts the app-server and thread session after a client failure', async () => {
    const manager = createManager('conversation-restart-after-failure');

    const firstSend = manager.sendMessage({ content: 'first', msg_id: 'message-1' });
    await waitForTurnStart();
    testDoubles.state.turnGates[0].resolve();
    await firstSend;

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;
    client.emitFailure(new Error('app-server crashed'));

    const secondSend = manager.sendMessage({ content: 'second', msg_id: 'message-2' });
    await waitForTurnStart(2);
    testDoubles.state.turnGates[1].resolve();
    await secondSend;

    expect(client.start).toHaveBeenCalledTimes(2);
    expect(session.start).toHaveBeenCalledTimes(2);
    expect(session.startTurn).toHaveBeenCalledTimes(2);

    manager.kill();
  });

  it('keeps the active send running when an overlapping send is rejected locally', async () => {
    const conversationId = 'conversation-send-serialization';
    const manager = createManager(conversationId);

    const firstSend = manager.sendMessage({ content: 'first', msg_id: 'message-1' });
    await waitForTurnStart();

    await expect(manager.sendMessage({ content: 'second', msg_id: 'message-2' })).rejects.toThrow(
      'Codex native agent is already processing a message'
    );

    const session = testDoubles.state.sessions[0] as FakeSession;
    expect(session.startTurn).toHaveBeenCalledTimes(1);
    expect(manager.status).toBe('running');
    expect(cronBusyGuard.isProcessing(conversationId)).toBe(true);

    testDoubles.state.turnGates[0].resolve();
    await firstSend;
    expect(manager.status).toBe('finished');
    expect(cronBusyGuard.isProcessing(conversationId)).toBe(false);

    manager.kill();
  });

  it('shares startup work when ensureStarted is called concurrently', async () => {
    const manager = createManager('conversation-start-serialization');
    testDoubles.state.clientStartGate = testDoubles.createDeferred() as Deferred;

    const firstStart = (manager as unknown as StartableManager).ensureStarted();
    await flushPromises();
    const secondStart = (manager as unknown as StartableManager).ensureStarted();
    await flushPromises();

    testDoubles.state.clientStartGate.resolve();
    await Promise.all([firstStart, secondStart]);

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;
    expect(client.start).toHaveBeenCalledTimes(1);
    expect(session.start).toHaveBeenCalledTimes(1);

    manager.kill();
  });

  it('resolves native server approval requests from confirmation choices', async () => {
    const manager = createManager('conversation-native-approval');
    const client = testDoubles.state.clients[0] as FakeClient;
    const request: CodexJsonRpcRequest = {
      jsonrpc: '2.0',
      id: 7,
      method: 'item/commandExecution/requestApproval',
      params: { command: ['bun', 'test'], reason: 'run tests' },
    };

    expect(client.serverRequestHandler).toBeDefined();

    const resultPromise = client.serverRequestHandler?.(request);
    expect(manager.getConfirmations()).toEqual([
      expect.objectContaining({
        id: 'codex_native_7',
        callId: 'codex_native_7',
        action: 'exec',
      }),
    ]);

    manager.confirm('codex_native_7', 'codex_native_7', 'allow_once');

    await expect(resultPromise).resolves.toEqual({ decision: 'accept' });
    expect(manager.getConfirmations()).toEqual([]);

    manager.kill();
  });
});
