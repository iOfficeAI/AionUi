/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { DEFAULT_CODEX_MODEL_ID, DEFAULT_CODEX_MODELS } from '@/common/codex/codexModels';
import type { ChannelConversationOverrides, ChannelThinkingLevel, TChatConversation, TProviderWithModel } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';
import { getDatabase } from '@/process/database';
import { ProcessConfig } from '@/process/initStorage';
import { ConversationService } from '@/process/services/conversationService';
import WorkerManage from '@/process/WorkerManage';
import { getAgentModes, type AgentModeOption } from '@renderer/constants/agentModes';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelManager } from '../core/ChannelManager';
import type { AgentDisplayInfo } from '../plugins/telegram/TelegramKeyboards';
import { createAgentSelectionKeyboard, createHelpKeyboard, createHistoryListKeyboard, createMainMenuKeyboard, createMessageListKeyboard, createSessionControlKeyboard, createSettingsApprovalsKeyboard, createSettingsModelKeyboard, createSettingsPanelKeyboard, createSettingsThinkingKeyboard, createSettingsToolKeyboard } from '../plugins/telegram/TelegramKeyboards';
import { escapeHtml } from '../plugins/telegram/TelegramAdapter';
import { getChannelConversationName, resolveChannelConvType } from '../types';
import { createAgentSelectionCard, createFeaturesCard, createHelpCard, createMainMenuCard, createPairingGuideCard, createSessionStatusCard, createSettingsCard, createTipsCard } from '../plugins/lark/LarkCards';
import { createAgentSelectionCard as createDingTalkAgentSelectionCard, createFeaturesCard as createDingTalkFeaturesCard, createHelpCard as createDingTalkHelpCard, createMainMenuCard as createDingTalkMainMenuCard, createPairingGuideCard as createDingTalkPairingGuideCard, createSessionStatusCard as createDingTalkSessionStatusCard, createSettingsCard as createDingTalkSettingsCard, createTipsCard as createDingTalkTipsCard } from '../plugins/dingtalk/DingTalkCards';
import type { ChannelAgentType, PluginType } from '../types';
import type { ActionHandler, IRegisteredAction } from './types';
import { SystemActionNames, createErrorResponse, createSuccessResponse } from './types';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/constants';
import type { AcpBackend, AcpBackendAll } from '@/types/acpTypes';

/**
 * Get the default model for Channel assistant (Telegram/Lark)
 * Reads from saved config or falls back to default Gemini model
 */

export async function getChannelDefaultModel(platform: PluginType): Promise<TProviderWithModel> {
  try {
    const providers = await ProcessConfig.get('model.config');
    const providerList = providers && Array.isArray(providers) ? providers : [];

    // Helper: find a provider with a valid API key
    const findProviderWithApiKey = (providerId: string, modelName: string): TProviderWithModel | null => {
      const provider = providerList.find((p) => p.id === providerId);
      if (provider?.apiKey && provider.model?.includes(modelName)) {
        return { ...provider, useModel: modelName } as TProviderWithModel;
      }
      return null;
    };

    // Try to get saved model selection
    const savedModel = platform === 'lark' ? await ProcessConfig.get('assistant.lark.defaultModel') : platform === 'dingtalk' ? await ProcessConfig.get('assistant.dingtalk.defaultModel') : await ProcessConfig.get('assistant.telegram.defaultModel');
    if (savedModel?.id && savedModel?.useModel) {
      // Google Auth is frontend-only (OAuth browser flow), not usable in channels.
      // Fall through to find a provider with a valid API key instead.
      if (savedModel.id === GOOGLE_AUTH_PROVIDER_ID) {
        console.warn(`[SystemActions] Google Auth is not supported in channel mode (${platform}), falling back to API key provider`);
        // Try to find any Gemini provider with API key for the same model
        const fallback = providerList.find((p) => p.platform === 'gemini' && p.apiKey && p.model?.includes(savedModel.useModel));
        if (fallback) {
          return { ...fallback, useModel: savedModel.useModel } as TProviderWithModel;
        }
        // Otherwise fall through to general fallback below
      } else {
        // For regular (API-key-based) providers, look up full config
        const result = findProviderWithApiKey(savedModel.id, savedModel.useModel);
        if (result) return result;
      }
    }

    // Fallback: try to get any Gemini provider with a valid API key
    const geminiProvider = providerList.find((p) => p.platform === 'gemini' && p.apiKey && p.model?.length);
    if (geminiProvider) {
      return {
        ...geminiProvider,
        useModel: geminiProvider.model[0],
      } as TProviderWithModel;
    }

    // Last resort: any provider with a valid API key
    const anyProvider = providerList.find((p) => p.apiKey && p.model?.length);
    if (anyProvider) {
      console.warn(`[SystemActions] No Gemini provider with API key, using ${anyProvider.platform} provider`);
      return {
        ...anyProvider,
        useModel: anyProvider.model[0],
      } as TProviderWithModel;
    }
  } catch (error) {
    console.warn('[SystemActions] Failed to get saved model, using default:', error);
  }

  // Default fallback - minimal config for Gemini (no API key — will fail with clear error)
  console.error('[SystemActions] No provider with valid API key found. Channel messages will fail.');
  return {
    id: 'gemini_default',
    platform: 'gemini',
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    useModel: 'gemini-2.0-flash',
  };
}

const HISTORY_PAGE_SIZE = 5;
const MESSAGE_PAGE_SIZE = 6;
const SETTINGS_MODEL_PAGE_SIZE = 8;

function getChannelSource(platform: PluginType): 'telegram' | 'lark' | 'dingtalk' {
  return platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : 'telegram';
}

function normalizeThinkingLevel(value?: string): ChannelThinkingLevel | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'off' || normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'xhigh') {
    return normalized;
  }
  return null;
}

function parseToolSelection(value?: string): { backend: AcpBackendAll; customAgentId?: string } | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const [rawBackend = '', ...rest] = trimmed.split(':');
  const backend = rawBackend.toLowerCase();

  if (backend === 'custom') {
    const customAgentId = rest.join(':').trim();
    return customAgentId ? { backend: 'custom', customAgentId } : null;
  }

  if (backend === 'openclaw' || backend === 'openclaw-gateway') {
    return { backend: 'openclaw-gateway' };
  }

  if (backend === 'gemini' || backend === 'codex' || backend === 'claude') {
    return { backend: backend as AcpBackendAll };
  }

  if (acpDetector.getDetectedAgents().some((agent) => agent.backend === backend)) {
    return { backend: backend as AcpBackendAll };
  }

  return null;
}

function getDetectedBackendInfo(backend: AcpBackendAll, customAgentId?: string): { backend: AcpBackendAll; name: string; cliPath?: string; customAgentId?: string } | null {
  if (backend === 'gemini') {
    return { backend: 'gemini', name: 'Gemini' };
  }
  const detected = acpDetector.getDetectedAgents().find((agent) => agent.backend === backend && (backend !== 'custom' || !customAgentId || agent.customAgentId === customAgentId));
  return detected ? { backend: detected.backend, name: detected.name, cliPath: detected.cliPath, customAgentId: detected.customAgentId } : null;
}

function resolveBackendForAgentType(agentType: ChannelAgentType): AcpBackendAll | null {
  if (agentType === 'gemini') return 'gemini';
  if (agentType === 'codex') return 'codex';
  if (agentType === 'openclaw-gateway') return 'openclaw-gateway';

  const detected = acpDetector.getDetectedAgents().find((agent) => backendToChannelAgentType(agent.backend) === 'acp' && agent.backend !== 'codex' && agent.backend !== 'openclaw-gateway' && agent.backend !== 'gemini');
  return (detected?.backend as AcpBackendAll | undefined) || 'claude';
}

function getConversationBackend(conversation: TChatConversation): string {
  if (conversation.type === 'acp') return conversation.extra.backend;
  if (conversation.type === 'openclaw-gateway') return conversation.extra.backend || 'openclaw-gateway';
  return conversation.type;
}

function getConversationToolLabel(conversation: TChatConversation): string {
  if (conversation.type === 'acp') {
    if (conversation.extra.backend === 'custom') {
      return conversation.extra.agentName || 'Custom Agent';
    }
    return conversation.extra.agentName || conversation.extra.backend;
  }

  const backend = getConversationBackend(conversation);
  if (backend === 'openclaw-gateway') return 'OpenClaw';
  if (backend === 'codex') return 'Codex';
  if (backend === 'gemini') return 'Gemini';
  return backend;
}

function getToolSelectionValue(agent: { backend: AcpBackendAll; customAgentId?: string }): string {
  if (agent.backend === 'openclaw-gateway') return 'openclaw';
  if (agent.backend === 'custom' && agent.customAgentId) return `custom:${agent.customAgentId}`;
  return agent.backend;
}

function getConversationToolSelectionValue(conversation: TChatConversation): string {
  const backend = getConversationBackend(conversation);
  if (backend === 'openclaw-gateway') return 'openclaw';
  if (backend === 'custom' && conversation.type === 'acp' && conversation.extra.customAgentId) {
    return `custom:${conversation.extra.customAgentId}`;
  }
  return backend;
}

function getConversationModelId(conversation: TChatConversation): string | undefined {
  if (conversation.type === 'gemini') return conversation.model.useModel;
  if (conversation.type === 'acp') return conversation.extra.currentModelId;
  if (conversation.type === 'codex') return conversation.extra.codexModel;
  if (conversation.type === 'openclaw-gateway') return conversation.extra.channelOverrides?.model || conversation.extra.runtimeValidation?.expectedModel;
  return undefined;
}

function getConversationThinking(conversation: TChatConversation): ChannelThinkingLevel | undefined {
  return conversation.extra.channelOverrides?.thinking;
}

function supportsExtendedThinkingLevel(conversation: TChatConversation | null): boolean {
  return conversation?.type === 'codex';
}

function getConversationApprovalMode(conversation: TChatConversation): string | undefined {
  if (conversation.type === 'gemini' || conversation.type === 'acp' || conversation.type === 'codex') {
    return conversation.extra.sessionMode;
  }
  return undefined;
}

function getConversationModeBackend(conversation: TChatConversation): string | undefined {
  if (conversation.type === 'gemini' || conversation.type === 'codex') {
    return conversation.type;
  }
  if (conversation.type === 'acp') {
    return conversation.extra.backend;
  }
  return undefined;
}

function getConversationApprovalOptions(conversation: TChatConversation | null): AgentModeOption[] {
  return conversation ? getAgentModes(getConversationModeBackend(conversation)) : [];
}

function isSupportedModeForBackend(backend: string, mode?: string): boolean {
  return !!mode && getAgentModes(backend).some((option) => option.value === mode);
}

function getLegacyYoloModeValue(backend: string): string | undefined {
  const options = getAgentModes(backend);
  return options.find((option) => option.value === 'yolo')?.value || options.find((option) => option.value === 'bypassPermissions')?.value;
}

async function getDefaultChannelSessionMode(backend: AcpBackendAll): Promise<string | undefined> {
  try {
    if (backend === 'gemini') {
      const config = await ProcessConfig.get('gemini.config');
      if (isSupportedModeForBackend('gemini', config?.preferredMode)) {
        return config?.preferredMode;
      }
      return config?.yoloMode ? getLegacyYoloModeValue('gemini') : undefined;
    }

    if (backend === 'codex') {
      const config = await ProcessConfig.get('codex.config');
      return config?.yoloMode ? getLegacyYoloModeValue('codex') : undefined;
    }

    if (backend === 'openclaw-gateway' || backend === 'custom') {
      return undefined;
    }

    const config = await ProcessConfig.get('acp.config');
    const backendConfig = config?.[backend as AcpBackend];
    if (isSupportedModeForBackend(backend, backendConfig?.preferredMode)) {
      return backendConfig?.preferredMode;
    }
    return backendConfig?.yoloMode ? getLegacyYoloModeValue(backend) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeModeToken(value?: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function getApprovalModeLabel(conversation: TChatConversation | null, mode?: string): string | undefined {
  if (!conversation) return undefined;
  const options = getConversationApprovalOptions(conversation);
  return options.find((option) => option.value === mode)?.label || mode;
}

function resolveApprovalModeSelection(conversation: TChatConversation, rawValue?: string): AgentModeOption | null {
  const normalized = normalizeModeToken(rawValue);
  if (!normalized) return null;

  const options = getConversationApprovalOptions(conversation);
  if (!options.length) return null;

  const direct = options.find((option) => normalizeModeToken(option.value) === normalized || normalizeModeToken(option.label) === normalized);
  if (direct) return direct;

  if (normalized === 'full' || normalized === 'fullauto' || normalized === 'yolo') {
    return options.find((option) => option.value === 'yolo' || option.value === 'bypassPermissions') || null;
  }

  if (normalized === 'auto' || normalized === 'edit' || normalized === 'autoedit' || normalized === 'autoacceptedits') {
    return options.find((option) => option.value === 'autoEdit') || null;
  }

  if (normalized === 'bypass' || normalized === 'bypasspermissions') {
    return options.find((option) => option.value === 'bypassPermissions') || null;
  }

  if (normalized === 'default' || normalized === 'ask' || normalized === 'safe') {
    return options.find((option) => option.value === 'default') || null;
  }

  if (normalized === 'plan') {
    return options.find((option) => option.value === 'plan') || options.find((option) => option.value === 'default') || null;
  }

  return null;
}

function truncate(value: string, length = 32): string {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}…` : value;
}

function html(value: string): string {
  return escapeHtml(value);
}

function getMessagePreview(message: TMessage): string {
  if (message.type === 'text' || message.type === 'tips') {
    return truncate(message.content.content || '', 72);
  }
  if (message.type === 'tool_group') {
    return truncate(message.content.map((item) => item.description || item.name).join(' | '), 72);
  }
  if (message.type === 'tool_call') {
    return truncate(message.content.name || 'Tool Call', 72);
  }
  if (message.type === 'agent_status') {
    return `Agent status: ${message.content.status}`;
  }
  if (message.type === 'plan') {
    return truncate('Plan updated', 72);
  }
  return truncate(message.type, 72);
}

function formatHistoryItem(conversation: TChatConversation): string {
  const tool = getConversationToolLabel(conversation);
  const model = getConversationModelId(conversation);
  const thinking = getConversationThinking(conversation);
  const approvals = getConversationApprovalMode(conversation);
  const approvalsLabel = getApprovalModeLabel(conversation, approvals);
  const parts = [tool];
  if (model) parts.push(model);
  if (thinking) parts.push(`think:${thinking}`);
  if (approvals) parts.push(`mode:${approvalsLabel || approvals}`);
  return truncate(parts.join(' | '), 40);
}

async function listChannelHistory(platform: PluginType, chatId: string): Promise<TChatConversation[]> {
  const db = getDatabase();
  return db
    .getUserConversations(undefined, 0, 500)
    .data.filter((conversation) => conversation.source === getChannelSource(platform) && conversation.channelChatId === chatId)
    .sort((a, b) => b.modifyTime - a.modifyTime);
}

async function sendOrEditTelegramPanel(
  context: Parameters<ActionHandler>[0],
  message: {
    type: 'text';
    text: string;
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    replyMarkup?: unknown;
  },
  originalMessageId?: string
): Promise<void> {
  if (context.platform === 'telegram' && originalMessageId) {
    try {
      await context.editMessage(originalMessageId, message);
      return;
    } catch (error) {
      console.warn('[SystemActions] Failed to edit Telegram settings panel, falling back to send:', error);
    }
  }
  await context.sendMessage(message);
}

function paginateItems<T>(items: T[], page: number, pageSize: number): { slice: T[]; hasPrev: boolean; hasNext: boolean } {
  const safePage = Math.max(0, page);
  const start = safePage * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    hasPrev: safePage > 0,
    hasNext: start + pageSize < items.length,
  };
}

async function getConversationModelCandidates(conversation: TChatConversation | null): Promise<Array<{ id: string; label: string }>> {
  if (!conversation) return [];

  if (conversation.type === 'gemini') {
    const modelList = (conversation.model as TProviderWithModel & { model?: string[] }).model || [];
    return modelList.map((id) => ({ id, label: id }));
  }

  if (conversation.type === 'codex') {
    return DEFAULT_CODEX_MODELS.map((model) => ({ id: model.id, label: model.label }));
  }

  if (conversation.type === 'acp') {
    try {
      const task = await WorkerManage.getTaskByIdRollbackBuild(conversation.id);
      if ('getModelInfo' in task && typeof task.getModelInfo === 'function') {
        const info = task.getModelInfo();
        if (info?.availableModels?.length) {
          return info.availableModels;
        }
      }
    } catch {
      // ignore and fall back to cached models
    }

    try {
      const cachedModels = await ProcessConfig.get('acp.cachedModels');
      return cachedModels?.[conversation.extra.backend]?.availableModels || [];
    } catch {
      return [];
    }
  }

  if (conversation.type === 'openclaw-gateway') {
    const current = conversation.extra.channelOverrides?.model || conversation.extra.runtimeValidation?.expectedModel;
    return current ? [{ id: current, label: current }] : [];
  }

  return [];
}

async function clearActiveSessionContext(context: Parameters<ActionHandler>[0]): Promise<void> {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();
  if (!sessionManager || !context.channelUser) return;

  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);
  if (!existingSession) return;

  await getChannelMessageService().clearContext(existingSession.id);
  if (existingSession.conversationId) {
    try {
      WorkerManage.kill(existingSession.conversationId);
    } catch (err) {
      console.warn('[SystemActions] Failed to kill previous conversation:', err);
    }
  }
  sessionManager.clearSession(context.channelUser.id, context.chatId);
}

async function createChannelConversationForBackend(
  context: Parameters<ActionHandler>[0],
  backend: AcpBackendAll,
  overrides: ChannelConversationOverrides = {},
  options: {
    customAgentId?: string;
    sessionMode?: string;
  } = {}
): Promise<{ conversation: TChatConversation; sessionId: string }> {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();
  if (!sessionManager) {
    throw new Error('Session manager not available');
  }
  if (!context.channelUser) {
    throw new Error('User not authorized');
  }

  const detected = getDetectedBackendInfo(backend, options.customAgentId);
  if (!detected && backend !== 'gemini') {
    throw new Error(`${backend} is not available on this host`);
  }

  const source = getChannelSource(context.platform);
  const model = await getChannelDefaultModel(context.platform);
  const sessionMode = options.sessionMode ?? (await getDefaultChannelSessionMode(backend));
  const { convType, convBackend } = resolveChannelConvType(backend);
  const name = getChannelConversationName(context.platform, convType, convBackend, context.chatId);

  const result =
    backend === 'gemini'
      ? await ConversationService.createGeminiConversation({
          model: overrides.model ? { ...model, useModel: overrides.model } : model,
          source,
          name,
          channelChatId: context.chatId,
          sessionMode,
          channelOverrides: overrides,
        })
      : backend === 'codex'
        ? await ConversationService.createConversation({
            type: 'codex',
            model,
            source,
            name,
            channelChatId: context.chatId,
            extra: {
              cliPath: detected?.cliPath,
              sessionMode,
              codexModel: overrides.model || DEFAULT_CODEX_MODEL_ID,
              channelOverrides: overrides,
            },
          })
        : backend === 'openclaw-gateway'
          ? await ConversationService.createConversation({
              type: 'openclaw-gateway',
              model,
              source,
              name,
              channelChatId: context.chatId,
              extra: {
                backend,
                agentName: detected?.name,
                cliPath: detected?.cliPath,
                runtimeValidation: {
                  expectedBackend: backend,
                  expectedAgentName: detected?.name,
                  expectedCliPath: detected?.cliPath,
                  expectedModel: overrides.model,
                  switchedAt: Date.now(),
                },
                channelOverrides: overrides,
              },
            })
          : await ConversationService.createConversation({
              type: 'acp',
              model,
              source,
              name,
              channelChatId: context.chatId,
              extra: {
                backend: backend as AcpBackend,
                cliPath: detected?.cliPath,
                customAgentId: options.customAgentId || detected?.customAgentId,
                agentName: detected?.name,
                sessionMode,
                currentModelId: overrides.model,
                channelOverrides: overrides,
              },
            });

  if (!result.success || !result.conversation) {
    throw new Error(result.error || 'Failed to create conversation');
  }

  const session = sessionManager.createSessionWithConversation(context.channelUser, result.conversation.id, convType as ChannelAgentType, undefined, context.chatId);
  return {
    conversation: result.conversation,
    sessionId: session.id,
  };
}

async function getCurrentConversation(context: Parameters<ActionHandler>[0]): Promise<TChatConversation | null> {
  if (!context.conversationId) return null;
  const db = getDatabase();
  const result = db.getConversation(context.conversationId);
  return result.success && result.data ? result.data : null;
}

async function persistConversationSessionMode(conversation: TChatConversation, mode: string, resetTask = false): Promise<void> {
  if (conversation.type !== 'gemini' && conversation.type !== 'acp' && conversation.type !== 'codex') {
    return;
  }

  const db = getDatabase();
  db.updateConversation(conversation.id, {
    extra: {
      ...conversation.extra,
      sessionMode: mode,
    },
  } as Partial<TChatConversation>);

  if (resetTask) {
    try {
      WorkerManage.kill(conversation.id);
    } catch (error) {
      console.warn('[SystemActions] Failed to reset task after session mode update:', error);
    }
  }
}

/**
 * SystemActions - Handlers for system-level actions
 *
 * These actions handle session management, help, and settings.
 * They don't require AI processing - just system operations.
 */

/**
 * Handle session.new - Create a new conversation session
 */
export const handleSessionNew: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  if (!context.channelUser) {
    return createErrorResponse('User not authorized');
  }

  await clearActiveSessionContext(context);

  let savedAgent: unknown = undefined;
  try {
    savedAgent = await (context.platform === 'lark' ? ProcessConfig.get('assistant.lark.agent') : context.platform === 'dingtalk' ? ProcessConfig.get('assistant.dingtalk.agent') : ProcessConfig.get('assistant.telegram.agent'));
  } catch {
    // ignore
  }

  const backend = (savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as any).backend === 'string' ? (savedAgent as any).backend : 'gemini') as AcpBackendAll;
  const customAgentId = savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as any).customAgentId === 'string' ? ((savedAgent as any).customAgentId as string) : undefined;
  let session;
  try {
    ({ sessionId: session } = await createChannelConversationForBackend(context, backend, {}, { customAgentId }));
  } catch (error) {
    return createErrorResponse(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
  }

  const markup = context.platform === 'lark' ? createMainMenuCard() : context.platform === 'dingtalk' ? createDingTalkMainMenuCard() : createMainMenuKeyboard();
  return createSuccessResponse({
    type: 'text',
    text: `🆕 <b>New Session Created</b>\n\nSession ID: <code>${session.slice(-8)}</code>\n\nYou can start a new conversation now!`,
    parseMode: 'HTML',
    replyMarkup: markup,
  });
};

/**
 * Handle session.status - Show current session status
 */
export const handleSessionStatus: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId, context.chatId) : null;
  const conversation = session?.conversationId
    ? (() => {
        const result = getDatabase().getConversation(session.conversationId!);
        return result.success && result.data ? result.data : null;
      })()
    : null;

  // Use platform-specific markup
  if (context.platform === 'lark') {
    const sessionData = session ? { id: session.id, agentType: session.agentType, createdAt: session.createdAt, lastActivity: session.lastActivity } : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createSessionStatusCard(sessionData),
    });
  }

  if (context.platform === 'dingtalk') {
    const sessionData = session ? { id: session.id, agentType: session.agentType, createdAt: session.createdAt, lastActivity: session.lastActivity } : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // DingTalk card includes the text
      replyMarkup: createDingTalkSessionStatusCard(sessionData),
    });
  }

  if (!session) {
    return createSuccessResponse({
      type: 'text',
      text: '📊 <b>Session Status</b>\n\nNo active session.\n\nSend a message to start a new conversation, or tap the "New Chat" button.',
      parseMode: 'HTML',
      replyMarkup: createSessionControlKeyboard(),
    });
  }

  const duration = Math.floor((Date.now() - session.createdAt) / 1000 / 60);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);
  const model = conversation ? getConversationModelId(conversation) : undefined;
  const thinking = conversation ? getConversationThinking(conversation) : undefined;
  const approvals = conversation ? getConversationApprovalMode(conversation) : undefined;
  const approvalsLabel = conversation ? getApprovalModeLabel(conversation, approvals) : undefined;

  return createSuccessResponse({
    type: 'text',
    text: ['📊 <b>Session Status</b>', '', `🤖 Agent: <code>${html(conversation ? getConversationToolLabel(conversation) : session.agentType)}</code>`, model ? `🧠 Model: <code>${html(model)}</code>` : undefined, thinking ? `💭 Thinking: <code>${html(thinking)}</code>` : undefined, approvals ? `🛡 Approvals: <code>${html(approvalsLabel || approvals)}</code>` : undefined, `⏱ Duration: ${duration} min`, `📝 Last activity: ${lastActivity} sec ago`, `🔖 Session ID: <code>${session.id.slice(-8)}</code>`].filter(Boolean).join('\n'),
    parseMode: 'HTML',
    replyMarkup: createSessionControlKeyboard(),
  });
};

/**
 * Handle help.show - Show help menu
 */
export const handleHelpShow: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createHelpCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkHelpCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: ['❓ <b>AionUi Assistant</b>', '', 'A remote assistant to interact with AionUi via Telegram.', '', '<b>Common Actions:</b>', '• 🆕 New Chat - Start a new session', '• 📊 Status - View current session status', '• ⚙️ Settings - Open the inline settings panel', '• ❓ Help - Show this help message', '', '<b>Slash Commands:</b>', '• /settings', '• /tool gemini|codex|openclaw', '• /model <model-id>', '• /think off|low|medium|high|xhigh', '• /approvals <mode> 例如: default | auto | full | yolo', '• /history', '• /messages', '', 'Send a message to chat with the AI assistant.'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.features - Show feature introduction
 */
export const handleHelpFeatures: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createFeaturesCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkFeaturesCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: ['🤖 <b>Features</b>', '', '<b>AI Chat</b>', '• Natural language conversation', '• Streaming output, real-time display', '• Context memory support', '', '<b>Session Management</b>', '• Single session mode', '• Clear context anytime', '• View session status', '', '<b>Message Actions</b>', '• Copy reply content', '• Regenerate reply', '• Continue conversation'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.pairing - Show pairing guide
 */
export const handleHelpPairing: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createPairingGuideCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkPairingGuideCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: ['🔗 <b>Pairing Guide</b>', '', '<b>First-time Setup:</b>', '1. Send any message to the bot', '2. Bot displays pairing code', '3. Approve pairing in AionUi settings', '4. Ready to use after pairing', '', '<b>Notes:</b>', '• Pairing code valid for 10 minutes', '• AionUi app must be running', '• One Telegram account can only pair once'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle help.tips - Show usage tips
 */
export const handleHelpTips: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createTipsCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkTipsCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: ['💬 <b>Tips</b>', '', '<b>Effective Conversations:</b>', '• Be clear and specific', '• Feel free to ask follow-ups', '• Regenerate if not satisfied', '', '<b>Quick Actions:</b>', '• Use bottom buttons for quick access', '• Tap message buttons for actions', '• New chat clears history context'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createHelpKeyboard(),
  });
};

/**
 * Handle settings.show - Show settings info
 */
export const handleSettingsShow: ActionHandler = async (context, params) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createSettingsCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkSettingsCard(),
    });
  }
  const view = params?.view || 'main';
  const pageRaw = params?.page || '0';
  const page = Math.max(0, Number.parseInt(String(pageRaw), 10) || 0);
  const originalMessageId = params?.originalMessageId;

  const conversation = await getCurrentConversation(context);
  const tool = conversation ? getConversationToolLabel(conversation) : undefined;
  const model = conversation ? getConversationModelId(conversation) : undefined;
  const thinking = conversation ? getConversationThinking(conversation) : undefined;
  const approvalsMode = conversation ? getConversationApprovalMode(conversation) : undefined;
  const approvalsLabel = conversation ? getApprovalModeLabel(conversation, approvalsMode) : undefined;

  if (view === 'tool') {
    const currentSelection = conversation ? getConversationToolSelectionValue(conversation) : '';
    const items: Array<{ label: string; value: string; current?: boolean }> = [{ label: 'Gemini', value: 'gemini', current: currentSelection === 'gemini' }];
    const seenValues = new Set(items.map((item) => item.value));
    for (const agent of acpDetector.getDetectedAgents()) {
      if (agent.backend === 'gemini') continue;
      const value = getToolSelectionValue(agent);
      if (seenValues.has(value)) continue;
      seenValues.add(value);
      const label = agent.backend === 'openclaw-gateway' ? 'OpenClaw' : agent.name;
      items.push({
        label,
        value,
        current: currentSelection === value,
      });
    }
    await sendOrEditTelegramPanel(
      context,
      {
        type: 'text',
        text: ['⚙️ <b>Settings</b> · Tool', '', `Current: <code>${html(tool || 'none')}</code>`, '', 'Select a tool:'].join('\n'),
        parseMode: 'HTML',
        replyMarkup: createSettingsToolKeyboard(items),
      },
      originalMessageId
    );
    return createSuccessResponse();
  }

  if (view === 'think') {
    if (!conversation) {
      await sendOrEditTelegramPanel(
        context,
        {
          type: 'text',
          text: ['⚙️ <b>Settings</b> · Thinking', '', 'Thinking level is applied per active session.', 'Start a session or switch tool first.'].join('\n'),
          parseMode: 'HTML',
          replyMarkup: createSettingsPanelKeyboard(false, false),
        },
        originalMessageId
      );
      return createSuccessResponse();
    }

    await sendOrEditTelegramPanel(
      context,
      {
        type: 'text',
        text: ['⚙️ <b>Settings</b> · Thinking', '', `Current: <code>${html(thinking || 'default')}</code>`, '', 'Select a level:'].join('\n'),
        parseMode: 'HTML',
        replyMarkup: createSettingsThinkingKeyboard(thinking, supportsExtendedThinkingLevel(conversation)),
      },
      originalMessageId
    );
    return createSuccessResponse();
  }

  if (view === 'model') {
    if (!conversation) {
      await sendOrEditTelegramPanel(
        context,
        {
          type: 'text',
          text: ['⚙️ <b>Settings</b> · Model', '', 'Model selection is applied per active session.', 'Start a session or switch tool first.'].join('\n'),
          parseMode: 'HTML',
          replyMarkup: createSettingsPanelKeyboard(false, false),
        },
        originalMessageId
      );
      return createSuccessResponse();
    }

    const candidates = await getConversationModelCandidates(conversation);
    if (!candidates.length) {
      await sendOrEditTelegramPanel(
        context,
        {
          type: 'text',
          text: ['⚙️ <b>Settings</b> · Model', '', `Current: <code>${html(model || 'unknown')}</code>`, '', 'No model list available for this tool.', 'Use: <code>/model &lt;model-id&gt;</code>'].join('\n'),
          parseMode: 'HTML',
          replyMarkup: createSettingsModelKeyboard([], page, false, false),
        },
        originalMessageId
      );
      return createSuccessResponse();
    }

    const { slice, hasPrev, hasNext } = paginateItems(candidates, page, SETTINGS_MODEL_PAGE_SIZE);
    const items = slice.map((m) => ({ label: m.label || m.id, current: m.id === model }));
    await sendOrEditTelegramPanel(
      context,
      {
        type: 'text',
        text: ['⚙️ <b>Settings</b> · Model', '', `Current: <code>${html(model || 'unknown')}</code>`, '', 'Select a model:'].join('\n'),
        parseMode: 'HTML',
        replyMarkup: createSettingsModelKeyboard(items, page, hasPrev, hasNext),
      },
      originalMessageId
    );
    return createSuccessResponse();
  }

  if (view === 'approvals') {
    if (!conversation) {
      await sendOrEditTelegramPanel(
        context,
        {
          type: 'text',
          text: ['⚙️ <b>Settings</b> · Approvals', '', 'Approval mode is applied per active session.', 'Start a session or switch tool first.'].join('\n'),
          parseMode: 'HTML',
          replyMarkup: createSettingsPanelKeyboard(false, false),
        },
        originalMessageId
      );
      return createSuccessResponse();
    }

    const options = getConversationApprovalOptions(conversation);
    if (!options.length) {
      await sendOrEditTelegramPanel(
        context,
        {
          type: 'text',
          text: ['⚙️ <b>Settings</b> · Approvals', '', `Current: <code>${html(approvalsLabel || approvalsMode || 'default')}</code>`, '', 'This tool does not support approval mode switching.', 'Use: <code>/approvals &lt;mode&gt;</code>'].join('\n'),
          parseMode: 'HTML',
          replyMarkup: createSettingsPanelKeyboard(true, false),
        },
        originalMessageId
      );
      return createSuccessResponse();
    }

    const items = options.map((option) => ({ label: option.label, value: option.value, current: option.value === approvalsMode }));
    await sendOrEditTelegramPanel(
      context,
      {
        type: 'text',
        text: ['⚙️ <b>Settings</b> · Approvals', '', `Current: <code>${html(approvalsLabel || approvalsMode || 'default')}</code>`, '', 'Select a mode:'].join('\n'),
        parseMode: 'HTML',
        replyMarkup: createSettingsApprovalsKeyboard(items),
      },
      originalMessageId
    );
    return createSuccessResponse();
  }

  await sendOrEditTelegramPanel(
    context,
    {
      type: 'text',
      text: ['⚙️ <b>Settings</b>', '', `🤖 Tool: <code>${html(tool || 'none')}</code>`, `🧠 Model: <code>${html(model || (conversation ? 'unknown' : 'inactive'))}</code>`, `💭 Thinking: <code>${html(thinking || (conversation ? 'default' : 'inactive'))}</code>`, `🛡 Approvals: <code>${html(approvalsLabel || approvalsMode || (conversation ? 'default' : 'inactive'))}</code>`, '', conversation ? 'Choose what to change:' : 'Choose a tool or start a session first.'].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createSettingsPanelKeyboard(!!conversation, !!(conversation && getConversationApprovalOptions(conversation).length)),
    },
    originalMessageId
  );

  return createSuccessResponse();
};

/**
 * Handle agent.show - Show agent selection keyboard/card
 */
export const handleAgentShow: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  // Get current agent type from session (scoped by chatId)
  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId, context.chatId) : null;
  const currentAgent = session?.agentType || 'gemini';

  // Get available agents dynamically
  const availableAgents = getAvailableChannelAgents();

  if (availableAgents.length === 0) {
    return createErrorResponse('No agents available');
  }

  // Use platform-specific markup
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createAgentSelectionCard(availableAgents, currentAgent),
    });
  }

  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkAgentSelectionCard(availableAgents, currentAgent),
    });
  }

  return createSuccessResponse({
    type: 'text',
    text: ['🔄 <b>Switch Agent</b>', '', 'Select an AI agent for your conversations:', '', `Current: <b>${getAgentDisplayName(currentAgent)}</b>`].join('\n'),
    parseMode: 'HTML',
    replyMarkup: createAgentSelectionKeyboard(availableAgents, currentAgent),
  });
};

/**
 * Handle agent.select - Switch to a different agent
 */
export const handleAgentSelect: ActionHandler = async (context, params) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  if (!context.channelUser) {
    return createErrorResponse('User not authorized');
  }

  const newAgentType = params?.agentType as ChannelAgentType;

  // Validate agent type is available
  const availableAgents = getAvailableChannelAgents();
  const isValidAgent = availableAgents.some((agent) => agent.type === newAgentType);
  if (!newAgentType || !isValidAgent) {
    return createErrorResponse('Invalid or unavailable agent type');
  }

  // Get current session (scoped by chatId)
  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);

  // If same agent, no need to switch
  if (existingSession?.agentType === newAgentType) {
    const markup = context.platform === 'lark' ? createMainMenuCard() : context.platform === 'dingtalk' ? createDingTalkMainMenuCard() : createMainMenuKeyboard();
    return createSuccessResponse({
      type: 'text',
      text: `✓ Already using <b>${getAgentDisplayName(newAgentType)}</b>`,
      parseMode: 'HTML',
      replyMarkup: markup,
    });
  }

  await clearActiveSessionContext(context);

  const backend = resolveBackendForAgentType(newAgentType);
  if (!backend) {
    return createErrorResponse('No backend available for this agent type');
  }

  try {
    await createChannelConversationForBackend(context, backend);
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }

  const markup = context.platform === 'lark' ? createMainMenuCard() : context.platform === 'dingtalk' ? createDingTalkMainMenuCard() : createMainMenuKeyboard();
  return createSuccessResponse({
    type: 'text',
    text: [`✓ <b>Switched to ${getAgentDisplayName(newAgentType)}</b>`, '', 'A new conversation has been started.', '', 'Send a message to begin!'].join('\n'),
    parseMode: 'HTML',
    replyMarkup: markup,
  });
};

export const handleToolSet: ActionHandler = async (context, params) => {
  const rawTool = params?.tool?.trim();
  const selection = parseToolSelection(rawTool);
  const originalMessageId = params?.originalMessageId?.trim();
  const currentConversation = await getCurrentConversation(context);
  if (!selection) {
    if (!rawTool && context.platform === 'telegram') {
      await handleSettingsShow(context, { view: 'tool', originalMessageId });
      return createSuccessResponse();
    }
    return createErrorResponse('Usage: /tool <tool-name>');
  }

  await clearActiveSessionContext(context);

  try {
    const preserveCurrentMode = currentConversation && getConversationBackend(currentConversation) === selection.backend && (!selection.customAgentId || (currentConversation.type === 'acp' && currentConversation.extra.customAgentId === selection.customAgentId)) ? getConversationApprovalMode(currentConversation) : undefined;
    const { conversation } = await createChannelConversationForBackend(context, selection.backend, {}, { customAgentId: selection.customAgentId, sessionMode: preserveCurrentMode });
    context.conversationId = conversation.id;
    if (originalMessageId) {
      await handleSettingsShow(context, { view: 'main', originalMessageId });
      return createSuccessResponse();
    }
    return createSuccessResponse({
      type: 'text',
      text: [`✓ <b>Switched Tool</b>`, '', `🤖 Tool: <code>${html(getConversationToolLabel(conversation))}</code>`, getConversationModelId(conversation) ? `🧠 Model: <code>${html(getConversationModelId(conversation) || '')}</code>` : undefined, 'A new conversation is active now.'].filter(Boolean).join('\n'),
      parseMode: 'HTML',
      replyMarkup: createMainMenuKeyboard(),
    });
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
};

export const handleModelSet: ActionHandler = async (context, params) => {
  const originalMessageId = params?.originalMessageId?.trim();
  const hasExplicitSelection = !!params?.model?.trim() || params?.page !== undefined || params?.index !== undefined;
  if (!hasExplicitSelection && context.platform === 'telegram') {
    await handleSettingsShow(context, { view: 'model', originalMessageId });
    return createSuccessResponse();
  }

  const conversation = await getCurrentConversation(context);
  if (!conversation) {
    return createErrorResponse('No active session. Use /tool first or send a message.');
  }

  const modelId = params?.model?.trim();
  const page = Number.parseInt(params?.page || '', 10);
  const index = Number.parseInt(params?.index || '', 10);
  const selectedModelId = modelId || (Number.isInteger(page) && page >= 0 && Number.isInteger(index) && index >= 0 ? (await getConversationModelCandidates(conversation))[page * SETTINGS_MODEL_PAGE_SIZE + index]?.id : undefined);

  if (!selectedModelId) {
    const usedInlineSelection = params?.page !== undefined || params?.index !== undefined;
    if (!usedInlineSelection && context.platform === 'telegram') {
      await handleSettingsShow(context, { view: 'model', originalMessageId });
      return createSuccessResponse();
    }
    return createErrorResponse(usedInlineSelection ? 'Selected model is no longer available. Refresh settings and try again.' : 'Usage: /model <model-id>');
  }

  const db = getDatabase();

  try {
    if (conversation.type === 'gemini') {
      db.updateConversation(conversation.id, {
        model: {
          ...conversation.model,
          useModel: selectedModelId,
        },
      } as Partial<TChatConversation>);
      WorkerManage.kill(conversation.id);
      if (originalMessageId) {
        await handleSettingsShow(context, { view: 'main', originalMessageId });
        return createSuccessResponse();
      }
      return createSuccessResponse({
        type: 'text',
        text: `✓ <b>Gemini model updated</b>\n\n<code>${html(selectedModelId)}</code>\n\nHistory is preserved and the next reply will use the new model.`,
        parseMode: 'HTML',
        replyMarkup: createSessionControlKeyboard(),
      });
    }

    if (conversation.type === 'acp') {
      db.updateConversation(conversation.id, {
        extra: {
          ...conversation.extra,
          currentModelId: selectedModelId,
          channelOverrides: {
            ...conversation.extra.channelOverrides,
            model: selectedModelId,
          },
        },
      } as Partial<TChatConversation>);
      const task = await WorkerManage.getTaskByIdRollbackBuild(conversation.id);
      if ('setModel' in task && typeof task.setModel === 'function') {
        await task.setModel(selectedModelId);
      }
      if (originalMessageId) {
        await handleSettingsShow(context, { view: 'main', originalMessageId });
        return createSuccessResponse();
      }
      return createSuccessResponse({
        type: 'text',
        text: `✓ <b>ACP model updated</b>\n\n<code>${html(selectedModelId)}</code>`,
        parseMode: 'HTML',
        replyMarkup: createSessionControlKeyboard(),
      });
    }

    if (conversation.type === 'codex') {
      await clearActiveSessionContext(context);
      const { conversation: nextConversation } = await createChannelConversationForBackend(
        context,
        'codex',
        {
          ...conversation.extra.channelOverrides,
          model: selectedModelId,
        },
        {
          sessionMode: conversation.extra.sessionMode,
        }
      );
      context.conversationId = nextConversation.id;
      if (originalMessageId) {
        await handleSettingsShow(context, { view: 'main', originalMessageId });
        return createSuccessResponse();
      }
      return createSuccessResponse({
        type: 'text',
        text: [`✓ <b>Codex model updated</b>`, '', `🧠 Model: <code>${html(selectedModelId)}</code>`, 'A new Codex session was created because model selection is applied at session startup.'].join('\n'),
        parseMode: 'HTML',
        replyMarkup: createSessionControlKeyboard(),
      });
    }

    if (conversation.type === 'openclaw-gateway') {
      db.updateConversation(conversation.id, {
        extra: {
          ...conversation.extra,
          runtimeValidation: {
            ...conversation.extra.runtimeValidation,
            expectedModel: selectedModelId,
            switchedAt: Date.now(),
          },
          channelOverrides: {
            ...conversation.extra.channelOverrides,
            model: selectedModelId,
          },
        },
      } as Partial<TChatConversation>);
      const task = await WorkerManage.getTaskByIdRollbackBuild(conversation.id);
      if ('setModel' in task && typeof task.setModel === 'function') {
        await task.setModel(selectedModelId);
      }
      if (originalMessageId) {
        await handleSettingsShow(context, { view: 'main', originalMessageId });
        return createSuccessResponse();
      }
      return createSuccessResponse({
        type: 'text',
        text: `✓ <b>OpenClaw model updated</b>\n\n<code>${html(selectedModelId)}</code>`,
        parseMode: 'HTML',
        replyMarkup: createSessionControlKeyboard(),
      });
    }
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }

  return createErrorResponse('Model switching is not supported for this conversation type');
};

export const handleThinkSet: ActionHandler = async (context, params) => {
  const rawLevel = params?.level?.trim();
  const level = normalizeThinkingLevel(params?.level);
  const originalMessageId = params?.originalMessageId?.trim();
  if (!level) {
    if (!rawLevel && context.platform === 'telegram') {
      await handleSettingsShow(context, { view: 'think', originalMessageId });
      return createSuccessResponse();
    }
    return createErrorResponse('Usage: /think off|low|medium|high|xhigh');
  }

  const conversation = await getCurrentConversation(context);
  if (!conversation) {
    return createErrorResponse('No active session. Use /tool first or send a message.');
  }

  try {
    const db = getDatabase();

    if (conversation.type === 'codex') {
      await clearActiveSessionContext(context);
      const { conversation: nextConversation } = await createChannelConversationForBackend(
        context,
        'codex',
        {
          ...conversation.extra.channelOverrides,
          thinking: level,
        },
        {
          sessionMode: conversation.extra.sessionMode,
        }
      );
      context.conversationId = nextConversation.id;
      if (originalMessageId) {
        await handleSettingsShow(context, { view: 'main', originalMessageId });
        return createSuccessResponse();
      }
      return createSuccessResponse({
        type: 'text',
        text: [`✓ <b>Codex thinking updated</b>`, '', `💭 Reasoning: <code>${html(level)}</code>`, 'A new Codex session was created because reasoning effort is applied at session startup.'].join('\n'),
        parseMode: 'HTML',
        replyMarkup: createSessionControlKeyboard(),
      });
    }

    db.updateConversation(conversation.id, {
      extra: {
        ...conversation.extra,
        channelOverrides: {
          ...conversation.extra.channelOverrides,
          thinking: level,
        },
      },
    } as Partial<TChatConversation>);

    if (conversation.type === 'openclaw-gateway') {
      const task = await WorkerManage.getTaskByIdRollbackBuild(conversation.id);
      if ('setThinking' in task && typeof task.setThinking === 'function') {
        await task.setThinking(level);
      }
      if (originalMessageId) {
        await handleSettingsShow(context, { view: 'main', originalMessageId });
        return createSuccessResponse();
      }
      return createSuccessResponse({
        type: 'text',
        text: `✓ <b>OpenClaw thinking updated</b>\n\n<code>${html(level)}</code>\n\nThe current session has been updated and the next reply will use it.`,
        parseMode: 'HTML',
        replyMarkup: createSessionControlKeyboard(),
      });
    }

    if (originalMessageId) {
      await handleSettingsShow(context, { view: 'main', originalMessageId });
      return createSuccessResponse();
    }
    return createSuccessResponse({
      type: 'text',
      text: conversation.type === 'gemini' ? `✓ <b>Gemini thinking updated</b>\n\n<code>${html(level)}</code>\n\nThe next reply will use Gemini's native thinking controls.` : `✓ <b>Thinking preference updated</b>\n\n<code>${html(level)}</code>\n\nThis will be applied on the next reply.`,
      parseMode: 'HTML',
      replyMarkup: createSessionControlKeyboard(),
    });
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
};

export const handleApprovalsSet: ActionHandler = async (context, params) => {
  const originalMessageId = params?.originalMessageId?.trim();
  const rawMode = params?.mode?.trim();

  if (!rawMode && context.platform === 'telegram') {
    await handleSettingsShow(context, { view: 'approvals', originalMessageId });
    return createSuccessResponse();
  }

  const conversation = await getCurrentConversation(context);
  if (!conversation) {
    return createErrorResponse('No active session. Use /tool first or send a message.');
  }

  const options = getConversationApprovalOptions(conversation);
  if (!options.length) {
    return createErrorResponse('Approval mode switching is not supported for this tool');
  }

  const selectedMode = resolveApprovalModeSelection(conversation, rawMode);
  if (!selectedMode) {
    return createErrorResponse(`Unsupported approval mode. Available: ${options.map((option) => option.label).join(', ')}`);
  }

  try {
    const task = await WorkerManage.getTaskByIdRollbackBuild(conversation.id);
    if (!('setMode' in task) || typeof task.setMode !== 'function') {
      return createErrorResponse('Approval mode switching is not supported for this session');
    }

    const result = await task.setMode(selectedMode.value);
    if (!result?.success) {
      const errorMessage = result?.msg || 'Failed to update approval mode';
      if (conversation.type === 'acp' && /no active session/i.test(errorMessage)) {
        await persistConversationSessionMode(conversation, selectedMode.value, true);
        if (originalMessageId) {
          await handleSettingsShow(context, { view: 'main', originalMessageId });
          return createSuccessResponse();
        }
        return createSuccessResponse({
          type: 'text',
          text: [`✓ <b>Approval mode saved</b>`, '', `🛡 Mode: <code>${html(selectedMode.label)}</code>`, `🤖 Tool: <code>${html(getConversationToolLabel(conversation))}</code>`, 'It will be applied when the next session starts.'].join('\n'),
          parseMode: 'HTML',
          replyMarkup: createSessionControlKeyboard(),
        });
      }
      return createErrorResponse(errorMessage);
    }

    if (originalMessageId) {
      await handleSettingsShow(context, { view: 'main', originalMessageId });
      return createSuccessResponse();
    }

    return createSuccessResponse({
      type: 'text',
      text: [`✓ <b>Approval mode updated</b>`, '', `🛡 Mode: <code>${html(selectedMode.label)}</code>`, `🤖 Tool: <code>${html(getConversationToolLabel(conversation))}</code>`].join('\n'),
      parseMode: 'HTML',
      replyMarkup: createSessionControlKeyboard(),
    });
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
};

export const handleHistoryShow: ActionHandler = async (context, params) => {
  const page = Math.max(0, Number.parseInt(params?.page || '0', 10) || 0);
  const conversations = await listChannelHistory(context.platform, context.chatId);
  const activeConversationId = context.conversationId;
  const start = page * HISTORY_PAGE_SIZE;
  const items = conversations.slice(start, start + HISTORY_PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = start + HISTORY_PAGE_SIZE < conversations.length;

  if (context.platform !== 'telegram') {
    const lines = items.map((conversation, index) => `${start + index + 1}. ${html(formatHistoryItem(conversation))}`);
    return createSuccessResponse({
      type: 'text',
      text: lines.length > 0 ? ['🗂 History', '', ...lines].join('\n') : '🗂 No history for this chat yet.',
      parseMode: 'HTML',
    });
  }

  return createSuccessResponse({
    type: 'text',
    text: items.length > 0 ? ['🗂 <b>Conversation History</b>', '', ...items.map((conversation, index) => `${start + index + 1}. ${html(formatHistoryItem(conversation))}`)].join('\n') : '🗂 <b>Conversation History</b>\n\nNo history for this chat yet.',
    parseMode: 'HTML',
    replyMarkup: createHistoryListKeyboard(
      items.map((conversation) => ({
        id: conversation.id,
        label: formatHistoryItem(conversation),
        current: conversation.id === activeConversationId,
      })),
      page,
      hasPrev,
      hasNext
    ),
  });
};

export const handleHistorySelect: ActionHandler = async (context, params) => {
  const conversationId = params?.conversationId;
  if (!conversationId) {
    return createErrorResponse('Missing conversation ID');
  }

  const db = getDatabase();
  const result = db.getConversation(conversationId);
  if (!result.success || !result.data) {
    return createErrorResponse('Conversation not found');
  }

  const conversation = result.data;
  if (conversation.source !== getChannelSource(context.platform) || conversation.channelChatId !== context.chatId) {
    return createErrorResponse('Conversation does not belong to this chat');
  }

  await clearActiveSessionContext(context);

  const sessionManager = getChannelManager().getSessionManager();
  if (!sessionManager || !context.channelUser) {
    return createErrorResponse('Session manager not available');
  }

  const backend = getConversationBackend(conversation);
  const { convType } = resolveChannelConvType(backend);
  const session = sessionManager.createSessionWithConversation(context.channelUser, conversation.id, convType as ChannelAgentType, undefined, context.chatId);

  return createSuccessResponse({
    type: 'text',
    text: [`✓ <b>Switched Conversation</b>`, '', `🤖 Tool: <code>${html(getConversationToolLabel(conversation))}</code>`, getConversationModelId(conversation) ? `🧠 Model: <code>${html(getConversationModelId(conversation) || '')}</code>` : undefined, getConversationThinking(conversation) ? `💭 Thinking: <code>${html(getConversationThinking(conversation) || '')}</code>` : undefined, getConversationApprovalMode(conversation) ? `🛡 Approvals: <code>${html(getApprovalModeLabel(conversation, getConversationApprovalMode(conversation)) || getConversationApprovalMode(conversation) || '')}</code>` : undefined, `🔖 Session ID: <code>${session.id.slice(-8)}</code>`].filter(Boolean).join('\n'),
    parseMode: 'HTML',
    replyMarkup: createSessionControlKeyboard(),
  });
};

export const handleMessagesShow: ActionHandler = async (context, params) => {
  const page = Math.max(0, Number.parseInt(params?.page || '0', 10) || 0);
  const conversationId = params?.conversationId || context.conversationId;
  if (!conversationId) {
    return createErrorResponse('No active conversation');
  }

  const db = getDatabase();
  const conversationResult = db.getConversation(conversationId);
  if (!conversationResult.success || !conversationResult.data) {
    return createErrorResponse('Conversation not found');
  }

  const conversation = conversationResult.data;
  if (conversation.source !== getChannelSource(context.platform) || conversation.channelChatId !== context.chatId) {
    return createErrorResponse('Conversation does not belong to this chat');
  }

  const messages = db.getConversationMessages(conversationId, page, MESSAGE_PAGE_SIZE, 'DESC');
  const lines = messages.data.map((message, index) => {
    const side = message.position === 'right' ? 'You' : 'AI';
    return `${page * MESSAGE_PAGE_SIZE + index + 1}. [${side}] ${html(getMessagePreview(message))}`;
  });

  return createSuccessResponse({
    type: 'text',
    text: lines.length > 0 ? ['📄 <b>Messages</b>', '', ...lines].join('\n') : '📄 <b>Messages</b>\n\nNo messages in this conversation yet.',
    parseMode: 'HTML',
    replyMarkup: context.platform === 'telegram' ? createMessageListKeyboard(conversationId, page, page > 0, messages.hasMore) : undefined,
  });
};

/**
 * Get display name for agent type
 */
function getAgentDisplayName(agentType: ChannelAgentType): string {
  const names: Record<ChannelAgentType, string> = {
    gemini: '🤖 Gemini',
    acp: '🧠 Claude',
    codex: '⚡ Codex',
    'openclaw-gateway': '🦞 OpenClaw',
  };
  return names[agentType] || agentType;
}

/**
 * Map backend type to ChannelAgentType
 * Only returns types that are supported by channels
 */
function backendToChannelAgentType(backend: string): ChannelAgentType | null {
  const mapping: Record<string, ChannelAgentType> = {
    gemini: 'gemini',
    claude: 'acp',
    codex: 'codex',
    'openclaw-gateway': 'openclaw-gateway',
  };
  return mapping[backend] || null;
}

/**
 * Get emoji for agent backend
 */
function getAgentEmoji(backend: string): string {
  const emojis: Record<string, string> = {
    gemini: '🤖',
    claude: '🧠',
    codex: '⚡',
    'openclaw-gateway': '🦞',
  };
  return emojis[backend] || '🤖';
}

/**
 * Get available agents for channel selection
 * Filters detected agents to only those supported by channels
 */
function getAvailableChannelAgents(): AgentDisplayInfo[] {
  const detectedAgents = acpDetector.getDetectedAgents();
  const availableAgents: AgentDisplayInfo[] = [];
  const seenTypes = new Set<ChannelAgentType>();

  // Always include Gemini as it's built-in
  availableAgents.push({ type: 'gemini', emoji: '🤖', name: 'Gemini' });
  seenTypes.add('gemini');

  // Add detected ACP agents (claude, codex, etc.)
  for (const agent of detectedAgents) {
    const channelType = backendToChannelAgentType(agent.backend);
    if (channelType && !seenTypes.has(channelType)) {
      availableAgents.push({
        type: channelType,
        emoji: getAgentEmoji(agent.backend),
        name: agent.name,
      });
      seenTypes.add(channelType);
    }
  }

  return availableAgents;
}

/**
 * All system actions
 */
export const systemActions: IRegisteredAction[] = [
  {
    name: SystemActionNames.SESSION_NEW,
    category: 'system',
    description: 'Create a new conversation session',
    handler: handleSessionNew,
  },
  {
    name: SystemActionNames.SESSION_STATUS,
    category: 'system',
    description: 'Show current session status',
    handler: handleSessionStatus,
  },
  {
    name: SystemActionNames.HELP_SHOW,
    category: 'system',
    description: 'Show help menu',
    handler: handleHelpShow,
  },
  {
    name: SystemActionNames.HELP_FEATURES,
    category: 'system',
    description: 'Show feature introduction',
    handler: handleHelpFeatures,
  },
  {
    name: SystemActionNames.HELP_PAIRING,
    category: 'system',
    description: 'Show pairing guide',
    handler: handleHelpPairing,
  },
  {
    name: SystemActionNames.HELP_TIPS,
    category: 'system',
    description: 'Show usage tips',
    handler: handleHelpTips,
  },
  {
    name: SystemActionNames.SETTINGS_SHOW,
    category: 'system',
    description: 'Show settings info',
    handler: handleSettingsShow,
  },
  {
    name: SystemActionNames.AGENT_SHOW,
    category: 'system',
    description: 'Show agent selection',
    handler: handleAgentShow,
  },
  {
    name: SystemActionNames.AGENT_SELECT,
    category: 'system',
    description: 'Switch to a different agent',
    handler: handleAgentSelect,
  },
  {
    name: SystemActionNames.TOOL_SET,
    category: 'system',
    description: 'Switch to a different tool',
    handler: handleToolSet,
  },
  {
    name: SystemActionNames.MODEL_SET,
    category: 'system',
    description: 'Set model for current tool',
    handler: handleModelSet,
  },
  {
    name: SystemActionNames.THINK_SET,
    category: 'system',
    description: 'Set thinking preference for current tool',
    handler: handleThinkSet,
  },
  {
    name: SystemActionNames.APPROVALS_SET,
    category: 'system',
    description: 'Set approval mode for current tool',
    handler: handleApprovalsSet,
  },
  {
    name: SystemActionNames.HISTORY_SHOW,
    category: 'system',
    description: 'Show history for current channel chat',
    handler: handleHistoryShow,
  },
  {
    name: SystemActionNames.HISTORY_SELECT,
    category: 'system',
    description: 'Switch to a historical conversation',
    handler: handleHistorySelect,
  },
  {
    name: SystemActionNames.MESSAGES_SHOW,
    category: 'system',
    description: 'Show messages for the current conversation',
    handler: handleMessagesShow,
  },
];
