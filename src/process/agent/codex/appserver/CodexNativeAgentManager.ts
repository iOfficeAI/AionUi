/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import path from 'path';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { CronMessageMeta, IConfirmation, TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { ipcBridge } from '@/common';
import { isCodexAutoApproveMode } from '@/common/types/codex/codexModes';
import {
  createChatgptReasoningEffortConfigOption,
  isChatgptReasoningEffortValue,
  normalizeCodexConfigOptionValues,
} from '@/common/types/codex/codexConfigOptions';
import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import BaseAgentManager from '@process/task/BaseAgentManager';
import { IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { prepareFirstMessageWithSkillsIndex } from '@process/task/agentUtils';
import {
  getCodexSandboxModeForSessionMode,
  type CodexSandboxMode,
  writeCodexSandboxMode,
} from '@process/task/codexConfig';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { CodexAppServerClient } from './CodexAppServerClient';
import { readCodexConfiguredModel } from './codexCliConfig';
import { appendCodexFileReferences } from '../handlers/CodexFileOperationHandler';
import { CodexModelService } from './CodexModelService';
import { CodexPermissionResolver } from './CodexPermissionResolver';
import { CodexThreadSession } from './CodexThreadSession';
import type { AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';

export type CodexNativeAgentManagerData = {
  conversation_id: string;
  workspace?: string;
  cliPath?: string;
  appServerCommand?: string;
  appServerArgs?: string[];
  codexThreadId?: string;
  sessionMode?: string;
  sandboxMode?: CodexSandboxMode;
  codexModel?: string;
  currentModelId?: string;
  configOptionValues?: Record<string, string>;
  cachedConfigOptions?: AcpSessionConfigOption[];
  pendingConfigOptions?: Record<string, string>;
  enabledSkills?: string[];
  presetContext?: string;
  yoloMode?: boolean;
};

const DEFAULT_CODEX_MODE = 'default';
const CODEX_REASONING_EFFORT_CONFIG_ID = 'reasoning_effort';
const LOGIN_SHELL_RESOLVE_TIMEOUT_MS = 1500;
const CODEX_CLI_PROBE_TIMEOUT_MS = 1500;

export function resolveCodexCliCommand(cliPath?: string): string {
  const command = cliPath?.trim() || 'codex';
  if (!shouldPreferLoginShellCodex(command)) return command;

  return resolveBestCodexCommand(command) || command;
}

function shouldPreferLoginShellCodex(command: string): boolean {
  if (command === 'codex') return true;

  const normalized = command.replace(/\\/g, '/');
  return normalized.endsWith('/codex') && normalized.includes('/.nvm/versions/node/');
}

function resolveBestCodexCommand(command: string): string | undefined {
  const candidates = collectCodexCommandCandidates(command);
  const probes = candidates
    .map((candidate) => ({ command: candidate, version: readCodexCliVersion(candidate) }))
    .filter((probe): probe is { command: string; version: [number, number, number] } => probe.version !== undefined);

  probes.sort((left, right) => compareVersionTuple(right.version, left.version));
  return probes[0]?.command;
}

function collectCodexCommandCandidates(command: string): string[] {
  const candidates = new Set<string>();
  if (command !== 'codex') {
    candidates.add(command);
  }

  const shellCommand = resolveCommandFromLoginShell(command);
  if (shellCommand) {
    candidates.add(shellCommand);
  }

  for (const candidate of ['/home/linuxbrew/.linuxbrew/bin/codex', '/opt/homebrew/bin/codex', '/usr/local/bin/codex']) {
    candidates.add(candidate);
  }

  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    if (entry.trim()) {
      candidates.add(path.join(entry, 'codex'));
    }
  }

  return [...candidates];
}

function readCodexCliVersion(command: string): [number, number, number] | undefined {
  try {
    const output = execFileSync(command, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: CODEX_CLI_PROBE_TIMEOUT_MS,
    });
    const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return undefined;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  } catch {
    return undefined;
  }
}

function compareVersionTuple(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = left[index] - right[index];
    if (delta !== 0) return delta;
  }
  return 0;
}

function resolveCommandFromLoginShell(command: string): string | undefined {
  if (process.platform === 'win32') {
    return undefined;
  }

  const shell = process.env.SHELL?.trim() || '/bin/bash';
  try {
    const resolvedCommand = execFileSync(shell, ['-lc', 'command -v codex'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: LOGIN_SHELL_RESOLVE_TIMEOUT_MS,
    }).trim();

    return resolvedCommand || undefined;
  } catch {
    return undefined;
  }
}

export class CodexNativeAgentManager extends BaseAgentManager<CodexNativeAgentManagerData, string> {
  workspace: string;
  private readonly options: CodexNativeAgentManagerData;
  private readonly client: CodexAppServerClient;
  private readonly modelService: CodexModelService;
  private readonly permissionResolver: CodexPermissionResolver;
  private readonly session: CodexThreadSession;
  private started = false;
  private startPromise: Promise<void> | undefined;
  private modelInfoLoaded = false;
  private modelInfoPromise: Promise<AcpModelInfo> | undefined;
  private readonly unsubscribeClientFailure: () => void;
  private isFirstMessage = true;
  private activeSendToken: symbol | undefined;
  private currentMode: string;
  private currentReasoningEffort: string;
  private readonly initialModelId: string | undefined;
  private readonly shouldPersistInitialModel: boolean;

  constructor(data: CodexNativeAgentManagerData) {
    super('codex', data, new IpcAgentEventEmitter(), false);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace || process.cwd();
    this.options = data;
    this.status = 'pending';
    this.client = new CodexAppServerClient({
      command: data.appServerCommand || resolveCodexCliCommand(data.cliPath),
      args: data.appServerCommand ? data.appServerArgs || [] : ['app-server', ...(data.appServerArgs || [])],
      cwd: this.workspace,
    });
    const initialModelId = data.codexModel || data.currentModelId || readCodexConfiguredModel();
    this.initialModelId = initialModelId;
    this.shouldPersistInitialModel = Boolean(initialModelId && !data.codexModel && !data.currentModelId);
    if (initialModelId) {
      this.options.codexModel = initialModelId;
      this.options.currentModelId = initialModelId;
    }
    this.currentMode = data.yoloMode ? 'yolo' : data.sessionMode || DEFAULT_CODEX_MODE;
    const configOptionValues = normalizeCodexConfigOptionValues({
      ...data.configOptionValues,
      ...data.pendingConfigOptions,
    });
    const configuredEffort = configOptionValues[CODEX_REASONING_EFFORT_CONFIG_ID];
    this.currentReasoningEffort = isChatgptReasoningEffortValue(configuredEffort) ? configuredEffort : 'medium';
    const runtimeConfig = this.resolveRuntimeConfig(this.currentMode);
    this.modelService = new CodexModelService(this.client, initialModelId);
    this.permissionResolver = new CodexPermissionResolver({
      addConfirmation: (confirmation) => this.addConfirmation(confirmation),
    });
    this.client.onServerRequest((request) => this.permissionResolver.handleRequest(request));
    this.unsubscribeClientFailure = this.client.onFailure(() => {
      this.started = false;
      this.startPromise = undefined;
      this.modelInfoLoaded = false;
      this.modelInfoPromise = undefined;
    });
    this.session = new CodexThreadSession({
      client: this.client,
      options: {
        conversationId: this.conversation_id,
        workspace: this.workspace,
        threadId: data.codexThreadId,
        approvalPolicy: runtimeConfig.approvalPolicy,
        sandboxPolicy: runtimeConfig.sandboxPolicy,
        model: initialModelId,
        reasoningEffort: this.currentReasoningEffort,
      },
      emitMessage: (message, persist) => this.emitAndPersistMessage(message, persist),
      emitConfirmation: (confirmation) => this.addConfirmation(confirmation),
      persistConversationExtra: (extra) => this.persistConversationExtra(extra),
    });
  }

  async sendMessage(data: {
    content: string;
    files?: string[];
    msg_id?: string;
    cronMeta?: CronMessageMeta;
  }): Promise<void> {
    if (this.activeSendToken) {
      const error = new Error('Codex native agent is already processing a message');
      this.emitAndPersistMessage(
        {
          type: 'error',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id || uuid(),
          data: error.message,
        },
        true
      );
      throw error;
    }

    const sendToken = Symbol('codex-native-send');
    this.activeSendToken = sendToken;
    this._lastActivityAt = Date.now();
    this.status = 'running';
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.ensureStarted();
      const msgId = data.msg_id || uuid();
      if (data.content) {
        const userMessage: TMessage = {
          id: msgId,
          msg_id: msgId,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: { content: data.content, ...(data.cronMeta && { cronMeta: data.cronMeta }) },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
      }

      const contentToSend = data.content?.includes(AIONUI_FILES_MARKER)
        ? data.content.split(AIONUI_FILES_MARKER)[0].trimEnd()
        : (data.content ?? '');
      const contentWithFileReferences = appendCodexFileReferences(contentToSend, data.files);
      const content = this.isFirstMessage
        ? (
            await prepareFirstMessageWithSkillsIndex(contentWithFileReferences, {
              presetContext: this.options.presetContext,
              enabledSkills: this.options.enabledSkills,
            })
          ).content
        : contentWithFileReferences;
      this.isFirstMessage = false;
      await this.session.startTurn({ content, msgId, files: data.files });
    } catch (error) {
      if (this.activeSendToken !== sendToken) {
        return;
      }
      this.emitAndPersistMessage(
        {
          type: 'error',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id || uuid(),
          data: error instanceof Error ? error.message : String(error),
        },
        true
      );
      throw error;
    } finally {
      if (this.activeSendToken === sendToken) {
        this.activeSendToken = undefined;
        this.status = 'finished';
        cronBusyGuard.setProcessing(this.conversation_id, false);
      }
    }
  }

  async stop(): Promise<void> {
    const hadActiveTurn = Boolean(this.activeSendToken || this.status === 'running');
    this.activeSendToken = undefined;
    this.status = 'finished';
    cronBusyGuard.setProcessing(this.conversation_id, false);
    if (!hadActiveTurn) {
      return;
    }

    void this.session.interrupt().catch(() => {});
    this.session.dispose();
    this.started = false;
    this.startPromise = undefined;
    await this.client.dispose();
  }

  confirm(msgId: string, callId: string, data: string): void {
    super.confirm(msgId, callId, data);
    this.permissionResolver.resolve(callId, data);
  }

  getModelInfo(): AcpModelInfo | null {
    return this.modelService.getModelInfo();
  }

  async loadModelInfo(): Promise<AcpModelInfo> {
    if (this.modelInfoLoaded) {
      return this.modelService.getModelInfo();
    }
    await this.client.start();
    return this.refreshModelInfo();
  }

  private async refreshModelInfo(): Promise<AcpModelInfo> {
    if (this.modelInfoLoaded) {
      return this.modelService.getModelInfo();
    }
    if (!this.modelInfoPromise) {
      this.modelInfoPromise = (async () => {
        const modelInfo = await this.modelService.refresh();
        this.modelInfoLoaded = true;
        return modelInfo;
      })();
    }
    const modelInfoPromise = this.modelInfoPromise;

    try {
      return await modelInfoPromise;
    } finally {
      if (this.modelInfoPromise === modelInfoPromise) {
        this.modelInfoPromise = undefined;
      }
    }
  }

  async setModel(modelId: string): Promise<AcpModelInfo> {
    const currentModelInfo = this.modelService.getModelInfo();
    if (currentModelInfo?.currentModelId === modelId) {
      return currentModelInfo;
    }
    if (this.activeSendToken || this.status === 'running') {
      throw new Error('Cannot change Codex model while a turn is running');
    }

    this.options.codexModel = modelId;
    this.options.currentModelId = modelId;
    await this.persistConversationExtra({ codexModel: modelId, currentModelId: modelId });
    const modelInfo = this.modelService.selectModel(modelId);
    this.session.updateRuntimeConfig({ model: modelId });
    this.emitModelInfo(modelInfo);
    return modelInfo;
  }

  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.currentMode, initialized: this.started };
  }

  async setMode(mode: string): Promise<{ success: boolean; msg?: string; data?: { mode: string } }> {
    if (this.activeSendToken || this.status === 'running') {
      return { success: false, msg: 'Cannot change Codex mode while a turn is running' };
    }

    this.currentMode = mode;
    this.options.sessionMode = mode;
    const runtimeConfig = this.resolveRuntimeConfig(mode);
    this.options.sandboxMode = runtimeConfig.sandboxPolicy;
    this.options.yoloMode = isCodexAutoApproveMode(mode);
    await writeCodexSandboxMode(runtimeConfig.sandboxPolicy);
    await this.persistConversationExtra({
      sessionMode: mode,
      sandboxMode: runtimeConfig.sandboxPolicy,
      yoloMode: this.options.yoloMode,
    });
    this.session.updateRuntimeConfig(runtimeConfig);
    return { success: true, data: { mode } };
  }

  getConfigOptions(): AcpSessionConfigOption[] {
    return [createChatgptReasoningEffortConfigOption(this.currentReasoningEffort)];
  }

  async setConfigOption(configId: string, value: string): Promise<AcpSessionConfigOption[]> {
    const normalized = normalizeCodexConfigOptionValues({ [configId]: value });
    const effort = normalized[CODEX_REASONING_EFFORT_CONFIG_ID];
    if (!isChatgptReasoningEffortValue(effort)) {
      throw new Error(`Unsupported Codex config option: ${configId}`);
    }
    if (this.activeSendToken || this.status === 'running') {
      throw new Error('Cannot change Codex reasoning effort while a turn is running');
    }

    this.currentReasoningEffort = effort;
    this.options.configOptionValues = {
      ...this.options.configOptionValues,
      [CODEX_REASONING_EFFORT_CONFIG_ID]: effort,
    };
    this.session.updateRuntimeConfig({ reasoningEffort: effort });
    const configOptions = this.getConfigOptions();
    await this.persistConversationExtra({
      configOptionValues: this.options.configOptionValues,
      cachedConfigOptions: configOptions,
    });
    return configOptions;
  }

  kill(): void {
    this.session.dispose();
    this.unsubscribeClientFailure();
    void this.client.dispose();
    super.kill();
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    if (!this.startPromise) {
      this.startPromise = (async () => {
        if (this.shouldPersistInitialModel && this.initialModelId) {
          await this.persistConversationExtra({
            codexModel: this.initialModelId,
            currentModelId: this.initialModelId,
          });
        }
        await this.client.start();
        await this.session.start();
        await this.emitCurrentModelInfo();
        this.started = true;
      })();
    }

    try {
      await this.startPromise;
    } finally {
      if (!this.started) {
        this.startPromise = undefined;
      }
    }
  }

  private emitAndPersistMessage(message: IResponseMessage, persist: boolean): void {
    const normalized = { ...message, conversation_id: this.conversation_id };
    if (persist) {
      const transformed = transformMessage(normalized);
      if (transformed) {
        if (
          transformed.type === 'agent_status' ||
          transformed.type === 'codex_tool_call' ||
          (transformed.type === 'text' && transformed.position === 'left')
        ) {
          addOrUpdateMessage(this.conversation_id, transformed);
        } else {
          addMessage(this.conversation_id, transformed);
        }
      }
    }
    ipcBridge.conversation.responseStream.emit(normalized);
  }

  private async emitCurrentModelInfo(): Promise<void> {
    try {
      this.emitModelInfo(await this.refreshModelInfo());
    } catch (error) {
      this.emitAndPersistMessage(
        {
          type: 'info',
          conversation_id: this.conversation_id,
          msg_id: `${this.conversation_id}-model-info-warning`,
          data: {
            level: 'warning',
            message: error instanceof Error ? error.message : String(error),
          },
        },
        false
      );
    }
  }

  private emitModelInfo(modelInfo: AcpModelInfo): void {
    ipcBridge.acpConversation.responseStream.emit({
      type: 'acp_model_info',
      conversation_id: this.conversation_id,
      msg_id: `${this.conversation_id}-model-info`,
      data: modelInfo,
    });
  }

  private resolveRuntimeConfig(mode: string): { approvalPolicy: string; sandboxPolicy: CodexSandboxMode } {
    return {
      approvalPolicy: isCodexAutoApproveMode(mode) ? 'never' : 'on-request',
      sandboxPolicy: getCodexSandboxModeForSessionMode(mode, this.options.sandboxMode),
    };
  }

  private async persistConversationExtra(extra: Record<string, unknown>): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (!result.success || !result.data) return;
      db.updateConversation(this.conversation_id, {
        extra: { ...result.data.extra, ...extra },
      });
    } catch {
      // Unit tests and early startup can run without an initialized DB; the live app persists when available.
    }
  }
}

export default CodexNativeAgentManager;
