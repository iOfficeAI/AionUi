/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { validateApiToken } from '../middleware/apiAuthMiddleware';
import { apiRateLimiter } from '../middleware/security';
import { conversationServiceSingleton } from '@process/services/conversationServiceSingleton';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { getDatabase, getDatabaseSync } from '@process/services/database';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import {
  drainConversationRuntime,
  listConversationRuntimeTaskIds,
  stopConversationRuntime,
} from '@process/services/ConversationRuntimeService';
import type { getConversationStatusSnapshot } from '@process/services/ConversationTurnCompletionService';
import {
  ConversationTurnCompletionService,
  formatStatusLastMessage,
  getConversationStatusCategory,
  getReadOnlyConversationStatusSnapshot,
  isConversationStatusWorking,
} from '@process/services/ConversationTurnCompletionService';
import { apiDiagnosticsService } from '@process/services/ApiDiagnosticsService';
import { getConversationMessageCacheStats } from '@process/utils/message';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type {
  ConversationTokenUsageMonitorResult,
  ConversationTokenUsageRange,
  ConversationTokenUsageRecord,
  ConversationTokenUsageSummary,
} from '@/common/tokenUsage';
import { uuid } from '@/common/utils';
import { buildConversationTitleFromMessage } from '@/common/utils/conversationTitle';

const router = Router();
const wrapAsyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => void | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
const VALID_CONVERSATION_TYPES = ['gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot'] as const;
type ConversationType = (typeof VALID_CONVERSATION_TYPES)[number];
type ConversationStatusValue = 'pending' | 'running' | 'finished';
type ConversationRuntimeState =
  | 'ai_generating'
  | 'ai_waiting_input'
  | 'ai_waiting_confirmation'
  | 'initializing'
  | 'stopped'
  | 'error'
  | 'unknown';
const VALID_CONVERSATION_LIST_SCOPES = ['generating', 'waiting', 'stopped', 'error', 'active', 'all'] as const;
const VALID_ACP_BACKENDS = [
  'claude',
  'gemini',
  'qwen',
  'iflow',
  'codex',
  'codebuddy',
  'droid',
  'goose',
  'auggie',
  'kimi',
  'opencode',
  'copilot',
  'qoder',
  'vibe',
  'custom',
] as const;
const ACP_BACKEND_SET = new Set<string>(VALID_ACP_BACKENDS);
type SimulationAction = 'create' | 'message' | 'status' | 'stop' | 'messages';
const SIMULATION_ACTIONS: SimulationAction[] = ['create', 'message', 'status', 'stop', 'messages'];
const STOP_DISPATCH_TIMEOUT_MS = 15000;
const STOP_VERIFY_TIMEOUT_MS = 20000;
const STOP_VERIFY_INTERVAL_MS = 250;
const RUNTIME_STATUS_DB_CANDIDATE_LIMIT = 1000;

// Apply middleware to all routes
router.use(validateApiToken);
router.use(apiRateLimiter);

const escapeSingleQuoteString = (value: string): string => value.replace(/'/g, "''");

const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const parseOptionalStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value);
  const nextValue = entries.reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const normalizedKey = parseOptionalString(key);
    const normalizedValue = parseOptionalString(rawValue);
    if (!normalizedKey || !normalizedValue) {
      return acc;
    }
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});

  return Object.keys(nextValue).length > 0 ? nextValue : {};
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const parseOptionalInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getFallbackConversationModel = (): TProviderWithModel =>
  ({
    id: 'default-provider',
    platform: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '***',
    useModel: 'gpt-4o-mini',
  }) as TProviderWithModel;

type MessageDispatchResult = {
  success: boolean;
  msg?: string;
};

const dispatchConversationMessage = async (
  conversationId: string,
  message: string,
  msgId: string,
  conversationType?: TChatConversation['type']
): Promise<MessageDispatchResult> => {
  try {
    const resolvedConversationType =
      conversationType ?? (await getDatabase()).getConversation(conversationId).data?.type;
    if (!resolvedConversationType) {
      return {
        success: false,
        msg: `Conversation not found: ${conversationId}`,
      };
    }

    const task = await workerTaskManager.getOrBuildTask(conversationId);
    const payload =
      resolvedConversationType === 'gemini' ? { input: message, msg_id: msgId } : { content: message, msg_id: msgId };

    await task.sendMessage(payload);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
};

const parseSessionIdQuery = (req: Request): string | undefined => parseOptionalString(req.query?.sessionId);

const parseListQueryValues = (value: unknown): string[] | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
};

const parseConversationTokenUsageRange = (req: Request): { range?: ConversationTokenUsageRange; error?: string } => {
  const rawStartTime = req.query?.startTime;
  const rawEndTime = req.query?.endTime;
  const startTime = parseOptionalInteger(rawStartTime);
  const endTime = parseOptionalInteger(rawEndTime);

  if (rawStartTime !== undefined && startTime === undefined) {
    return { error: 'Invalid startTime query parameter. Expected millisecond timestamp.' };
  }

  if (rawEndTime !== undefined && endTime === undefined) {
    return { error: 'Invalid endTime query parameter. Expected millisecond timestamp.' };
  }

  if (typeof startTime === 'number' && typeof endTime === 'number' && startTime > endTime) {
    return { error: 'Invalid time range. startTime must be less than or equal to endTime.' };
  }

  return {
    range: {
      startTime,
      endTime,
    },
  };
};

export type ConversationStatusListItem = {
  sessionId: string;
  conversationId: string;
  name?: string;
  type: TChatConversation['type'];
  cli?: string;
  source?: TChatConversation['source'];
  status: ConversationStatusValue;
  state: ConversationRuntimeState;
  category: ReturnType<typeof getConversationStatusCategory>;
  detail: string;
  canSendMessage: boolean;
  isWorking: boolean;
  runtime: {
    hasTask: boolean;
    taskStatus?: ConversationStatusValue;
    isProcessing: boolean;
    pendingConfirmations: number;
    dbStatus?: ConversationStatusValue;
    lastActiveAt?: number;
    processingStale: boolean;
  };
  lastMessage?: ReturnType<typeof formatStatusLastMessage>;
  updatedAt?: number;
  createdAt?: number;
};

type ConversationSnapshotGetter = (sessionId: string) => ReturnType<typeof getConversationStatusSnapshot>;
type ConversationListScope = (typeof VALID_CONVERSATION_LIST_SCOPES)[number];

type ConversationStatusListFilters = {
  scope: ConversationListScope;
  status?: ConversationStatusValue[];
  state?: ConversationRuntimeState[];
  type?: TChatConversation['type'][];
  cli?: string[];
  source?: string[];
  canSendMessage?: boolean;
};

const parseConversationListScope = (value: unknown): ConversationListScope | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return VALID_CONVERSATION_LIST_SCOPES.includes(normalized as ConversationListScope)
    ? (normalized as ConversationListScope)
    : undefined;
};

export const resolveConversationStatusListScope = (input: {
  scope?: ConversationListScope;
  status?: ConversationStatusValue[];
  state?: ConversationRuntimeState[];
}): ConversationListScope => {
  if (input.scope) {
    return input.scope;
  }

  // Explicit status/state filters should see the same candidate space as single-session status queries.
  if (input.status || input.state) {
    return 'all';
  }

  return 'generating';
};

const isConversationStatusWaiting = (snapshot: { state: ConversationRuntimeState }): boolean =>
  getConversationStatusCategory(snapshot.state) === 'waiting';

const isConversationStatusStopped = (snapshot: { state: ConversationRuntimeState }): boolean =>
  getConversationStatusCategory(snapshot.state) === 'stopped';

const isConversationStatusError = (snapshot: { state: ConversationRuntimeState }): boolean =>
  getConversationStatusCategory(snapshot.state) === 'error';

type ConversationUsagePage = {
  data: ConversationTokenUsageRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type ConversationUsageSummaryListItem = {
  sessionId: string;
  conversationType: TChatConversation['type'];
  backend?: string;
  summary: ConversationTokenUsageSummary;
};

export const isConversationStatusActive = (snapshot: {
  runtime: {
    hasTask: boolean;
  };
}): boolean => {
  return snapshot.runtime.hasTask;
};

export const isConversationStatusGenerating = (snapshot: {
  status: ConversationStatusValue;
  state: ConversationRuntimeState;
}): boolean => {
  return isConversationStatusWorking(snapshot.state);
};

const matchesConversationStatusListFilters = (
  item: ConversationStatusListItem,
  filters: ConversationStatusListFilters
): boolean => {
  if (filters.scope === 'active' && !isConversationStatusActive(item)) {
    return false;
  }

  if (filters.scope === 'generating' && !isConversationStatusGenerating(item)) {
    return false;
  }

  if (filters.scope === 'waiting' && !isConversationStatusWaiting(item)) {
    return false;
  }

  if (filters.scope === 'stopped' && !isConversationStatusStopped(item)) {
    return false;
  }

  if (filters.scope === 'error' && !isConversationStatusError(item)) {
    return false;
  }

  if (filters.status && !filters.status.includes(item.status)) {
    return false;
  }

  if (filters.state && !filters.state.includes(item.state)) {
    return false;
  }

  if (filters.type && !filters.type.includes(item.type)) {
    return false;
  }

  if (filters.cli && !filters.cli.includes(item.cli || '')) {
    return false;
  }

  if (filters.source && !filters.source.includes(item.source || '')) {
    return false;
  }

  if (typeof filters.canSendMessage === 'boolean' && item.canSendMessage !== filters.canSendMessage) {
    return false;
  }

  return true;
};

export const buildConversationStatusList = (
  conversations: TChatConversation[],
  filters: ConversationStatusListFilters = { scope: 'generating' },
  getSnapshot: ConversationSnapshotGetter = getReadOnlyConversationStatusSnapshot
): ConversationStatusListItem[] => {
  const items = conversations.reduce<ConversationStatusListItem[]>((result, conversation) => {
    const snapshot = getSnapshot(conversation.id);
    if (!snapshot) {
      return result;
    }

    const item = {
      sessionId: conversation.id,
      conversationId: conversation.id,
      name: conversation.name,
      type: conversation.type,
      cli: conversation.type === 'acp' ? conversation.extra.backend : undefined,
      source: conversation.source,
      status: snapshot.status,
      state: snapshot.state,
      category: getConversationStatusCategory(snapshot.state),
      detail: snapshot.detail,
      canSendMessage: snapshot.canSendMessage,
      isWorking: isConversationStatusWorking(snapshot.state),
      runtime: snapshot.runtime,
      lastMessage: formatStatusLastMessage(snapshot.lastMessage),
      updatedAt: conversation.modifyTime,
      createdAt: conversation.createTime,
    } satisfies ConversationStatusListItem;

    if (!matchesConversationStatusListFilters(item, filters)) {
      return result;
    }

    result.push(item);

    return result;
  }, []);

  return items.toSorted((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
};

type ConversationStatusLookupResult = {
  success: boolean;
  data?: TChatConversation;
};

type ConversationStatusListLookupResult = {
  data: TChatConversation[];
};

type ConversationStatusBatchLookupResult = {
  success: boolean;
  data?: TChatConversation[];
};

type ConversationListGetter = (userId?: string, page?: number, pageSize?: number) => ConversationStatusListLookupResult;

type ConversationStatusBatchGetter = (
  statuses: ConversationStatusValue[],
  userId?: string,
  limit?: number
) => ConversationStatusBatchLookupResult;

type ConversationStatusCandidateTask = {
  id: string;
};

type ConversationBusyState = {
  isProcessing: boolean;
};

type ConversationBusyStateMap = Map<string, ConversationBusyState>;

type ConversationStatusListDatabase = {
  getConversation: (conversationId: string) => ConversationStatusLookupResult;
  getUserConversations: ConversationListGetter;
  getUserConversationsByStatuses?: ConversationStatusBatchGetter;
};

type ConversationStatusListOptions = {
  db?: ConversationStatusListDatabase;
  runtimeCandidateIds?: string[];
};

type ConversationUsageResponseInput = {
  summary: ConversationTokenUsageSummary;
  usagePage: ConversationUsagePage;
  range?: ConversationTokenUsageRange;
};

const getDefaultConversationStatusCandidateTasks = (): ConversationStatusCandidateTask[] =>
  listConversationRuntimeTaskIds().map((id) => ({ id }));

const getDefaultConversationBusyStates = (): ConversationBusyStateMap => cronBusyGuard.getAllStates();

const getDefaultConversationMessageCacheIds = (): string[] =>
  getConversationMessageCacheStats().conversations.map((conversation) => conversation.conversationId);

const getDefaultConversationTurnCompletionInFlightIds = (): string[] =>
  ConversationTurnCompletionService.getInstance().getDebugState().inFlightSessionIds;

const getDefaultConversationStatusListDatabase = (): ConversationStatusListDatabase => getDatabaseSync();

const getDefaultConversationStatusCandidateIds = (): string[] => collectConversationStatusCandidateIds();

export function collectConversationStatusCandidateIds(
  tasks = getDefaultConversationStatusCandidateTasks(),
  busyStates = getDefaultConversationBusyStates(),
  messageCacheConversationIds = getDefaultConversationMessageCacheIds(),
  inFlightSessionIds = getDefaultConversationTurnCompletionInFlightIds()
): string[] {
  const sessionIds = new Set<string>();

  tasks.forEach(({ id }) => {
    sessionIds.add(id);
  });

  busyStates.forEach((state, sessionId) => {
    if (state.isProcessing) {
      sessionIds.add(sessionId);
    }
  });

  messageCacheConversationIds.forEach((sessionId) => {
    sessionIds.add(sessionId);
  });

  inFlightSessionIds.forEach((sessionId) => {
    sessionIds.add(sessionId);
  });

  return Array.from(sessionIds);
}

const sortConversationsByUpdatedAtDesc = (conversations: TChatConversation[]): TChatConversation[] =>
  [...conversations].toSorted((left, right) => right.modifyTime - left.modifyTime);

export function getConversationStatusListConversations(
  scope: ConversationListScope,
  options: ConversationStatusListOptions = {}
): TChatConversation[] {
  const db = options.db || getDefaultConversationStatusListDatabase();
  const runtimeCandidateIds = options.runtimeCandidateIds || getDefaultConversationStatusCandidateIds();

  if (scope === 'all' || scope === 'waiting' || scope === 'stopped' || scope === 'error') {
    return sortConversationsByUpdatedAtDesc(db.getUserConversations(undefined, 0, 10000).data || []);
  }

  const conversations = new Map<string, TChatConversation>();
  const runtimeStatusResult =
    typeof db.getUserConversationsByStatuses === 'function'
      ? db.getUserConversationsByStatuses(['pending', 'running'], undefined, RUNTIME_STATUS_DB_CANDIDATE_LIMIT)
      : (() => {
          const allConversations = db.getUserConversations(undefined, 0, 10000).data || [];
          return {
            success: true,
            data: allConversations.filter((conversation) => ['pending', 'running'].includes(conversation.status)),
          };
        })();

  if (runtimeStatusResult.success && runtimeStatusResult.data) {
    runtimeStatusResult.data.forEach((conversation) => {
      conversations.set(conversation.id, conversation);
    });
  }

  runtimeCandidateIds.forEach((sessionId) => {
    const result = db.getConversation(sessionId);
    if (result.success && result.data) {
      conversations.set(sessionId, result.data);
    }
  });

  return sortConversationsByUpdatedAtDesc(Array.from(conversations.values()));
}

const recordConversationApiDiagnostics = (input: {
  route: string;
  reason: string;
  sessionId?: string;
  force?: boolean;
  persist?: boolean;
}): void => {
  try {
    apiDiagnosticsService.captureRouteSample(input);
  } catch (error) {
    console.warn('[API] Failed to capture conversation diagnostics sample:', error, {
      route: input.route,
      reason: input.reason,
      sessionId: input.sessionId,
    });
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const invokeStopWithTimeout = async (
  sessionId: string,
  timeoutMs: number
): Promise<{ success: boolean; msg?: string }> => {
  const stopPromise = stopConversationRuntime(sessionId);
  const timeoutPromise = new Promise<{ success: false; msg: string }>((resolve) => {
    setTimeout(() => {
      resolve({ success: false, msg: `Stop dispatch timeout after ${timeoutMs}ms` });
    }, timeoutMs);
  });
  return Promise.race([stopPromise, timeoutPromise]);
};

const isStopConfirmed = (resolvedStatus: {
  runtime: { taskStatus?: ConversationStatusValue; isProcessing?: boolean; pendingConfirmations?: number };
}): boolean => {
  const runtime = resolvedStatus.runtime as {
    taskStatus?: ConversationStatusValue;
    isProcessing?: boolean;
    pendingConfirmations?: number;
  };
  return !runtime.isProcessing && (runtime.pendingConfirmations ?? 0) === 0 && runtime.taskStatus !== 'running';
};

export function buildConversationUsageResponse(
  sessionId: string,
  conversation: TChatConversation,
  input: ConversationUsageResponseInput
) {
  return {
    success: true,
    sessionId,
    conversationType: conversation.type,
    backend: conversation.type === 'acp' ? conversation.extra.backend : undefined,
    range: input.range || {},
    summary: input.summary,
    replies: input.usagePage.data,
    total: input.usagePage.total,
    page: input.usagePage.page,
    pageSize: input.usagePage.pageSize,
    hasMore: input.usagePage.hasMore,
  };
}

export const buildConversationUsageSummaryListResponse = (
  items: ConversationUsageSummaryListItem[],
  notFoundSessionIds: string[] = [],
  range: ConversationTokenUsageRange = {}
) => ({
  success: true,
  range,
  total: items.length,
  items,
  notFoundSessionIds,
});

export const buildConversationUsageMonitorResponse = (result: ConversationTokenUsageMonitorResult) => ({
  success: true,
  ...result,
});

const waitForStopConfirmed = async (sessionId: string, timeoutMs: number): Promise<void> => {
  const db = await getDatabase();
  const startedAt = Date.now();
  let lastState: ConversationRuntimeState | undefined;

  while (Date.now() - startedAt <= timeoutMs) {
    const convResult = db.getConversation(sessionId);
    if (!convResult.success || !convResult.data) {
      throw new Error('Conversation not found while waiting for stop confirmation');
    }

    const snapshot = getReadOnlyConversationStatusSnapshot(sessionId);
    if (!snapshot) {
      throw new Error(`Conversation snapshot not found: ${sessionId}`);
    }

    const resolvedStatus = snapshot;
    lastState = resolvedStatus.state;

    if (isStopConfirmed(resolvedStatus)) {
      return;
    }

    await sleep(STOP_VERIFY_INTERVAL_MS);
  }

  throw new Error(`Stop confirmation timeout after ${timeoutMs}ms (last state: ${lastState || 'unknown'})`);
};

const resolveConversationType = (rawType: unknown, rawCli: unknown): IResolveTypeResult => {
  const type = parseOptionalString(rawType);
  const cli = parseOptionalString(rawCli);

  if (type) {
    if (!VALID_CONVERSATION_TYPES.includes(type as ConversationType)) {
      return {
        success: false,
        error: `Invalid type. Must be one of: ${VALID_CONVERSATION_TYPES.join(', ')}`,
      };
    }
    return { success: true, type: type as ConversationType };
  }

  if (!cli) {
    return {
      success: false,
      error: 'Missing required field: type or cli',
    };
  }

  if (VALID_CONVERSATION_TYPES.includes(cli as ConversationType)) {
    return { success: true, type: cli as ConversationType };
  }

  if (ACP_BACKEND_SET.has(cli)) {
    return { success: true, type: 'acp', backendFromCli: cli };
  }

  return {
    success: false,
    error: `Invalid cli. Must be a conversation type (${VALID_CONVERSATION_TYPES.join(', ')}) or ACP backend (${VALID_ACP_BACKENDS.join(', ')})`,
  };
};

type IResolveTypeResult =
  | {
      success: true;
      type: ConversationType;
      backendFromCli?: string;
    }
  | {
      success: false;
      error: string;
    };

const buildSimulationPayload = (action: SimulationAction, sessionId: string, payload: Record<string, unknown>) => {
  const defaultCreatePayload = {
    type: 'gemini',
    cli: 'gemini',
    model: {
      id: 'default-provider',
      platform: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '***',
      useModel: 'gpt-4o-mini',
    },
    workspace: 'E:/code/project',
    mode: 'default',
    message: 'Hello from API simulation',
  };
  const encodedSessionId = encodeURIComponent(sessionId);

  const requestMap: Record<SimulationAction, { method: 'GET' | 'POST'; path: string; body?: Record<string, unknown> }> =
    {
      create: {
        method: 'POST',
        path: '/api/v1/conversation/create',
        body: { ...defaultCreatePayload, ...payload },
      },
      message: {
        method: 'POST',
        path: `/api/v1/conversation/message?sessionId=${encodedSessionId}`,
        body: { message: 'Continue response', ...payload },
      },
      status: {
        method: 'GET',
        path: `/api/v1/conversation/status?sessionId=${encodedSessionId}`,
      },
      stop: {
        method: 'POST',
        path: `/api/v1/conversation/stop?sessionId=${encodedSessionId}`,
      },
      messages: {
        method: 'GET',
        path: `/api/v1/conversation/messages?sessionId=${encodedSessionId}&page=0&pageSize=50`,
      },
    };

  const selected = requestMap[action];
  const bodyJson = selected.body ? JSON.stringify(selected.body) : '';
  const escapedBodyJson = escapeSingleQuoteString(bodyJson);

  const curlCommand =
    selected.method === 'GET'
      ? `curl -X GET "http://localhost:3000${selected.path}" -H "Authorization: Bearer <api_token>"`
      : `curl -X POST "http://localhost:3000${selected.path}" -H "Authorization: Bearer <api_token>" -H "Content-Type: application/json" -d '${bodyJson}'`;

  const powershellCommand =
    selected.method === 'GET'
      ? `Invoke-RestMethod -Method Get -Uri 'http://localhost:3000${selected.path}' -Headers @{ Authorization = 'Bearer <api_token>' }`
      : `$headers=@{ Authorization='Bearer <api_token>' }; $body='${escapedBodyJson}'; Invoke-RestMethod -Method Post -Uri 'http://localhost:3000${selected.path}' -Headers $headers -ContentType 'application/json' -Body $body`;

  return {
    action,
    method: selected.method,
    path: selected.path,
    headers: {
      Authorization: 'Bearer <api_token>',
      'Content-Type': selected.method === 'POST' ? 'application/json' : undefined,
    },
    requestBody: selected.body,
    sampleSuccessResponse:
      action === 'create'
        ? { success: true, sessionId: 'conv_example_001', status: 'running' }
        : action === 'messages'
          ? { success: true, messages: [] as unknown[], total: 0, page: 0, pageSize: 50, hasMore: false }
          : { success: true, sessionId, status: action === 'stop' ? 'finished' : 'running' },
    commands: {
      curl: curlCommand,
      powershell: powershellCommand,
    },
    note: 'Simulation only. No real conversation will be created or executed.',
  };
};

/**
 * POST /api/v1/conversation/create
 * Create a new conversation and send initial message
 * 创建新会话并发送初始消息
 */
router.post(
  '/create',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const { model } = req.body;
      const message = parseOptionalString(req.body?.message);
      const workspace = parseOptionalString(req.body?.workspace);
      const backend = parseOptionalString(req.body?.backend);
      const cliPath = parseOptionalString(req.body?.cliPath);
      const mode = parseOptionalString(req.body?.mode) || parseOptionalString(req.body?.sessionMode);
      const currentModelId = parseOptionalString(req.body?.currentModelId);
      const codexModel = parseOptionalString(req.body?.codexModel);
      const configOptionValues = parseOptionalStringRecord(req.body?.configOptionValues);
      const agentName = parseOptionalString(req.body?.agentName);
      const customAgentId = parseOptionalString(req.body?.customAgentId);
      const waitForDispatch = parseOptionalBoolean(req.body?.waitForDispatch) ?? false;

      const resolvedType = resolveConversationType(req.body?.type, req.body?.cli);
      if (!resolvedType.success) {
        return res.status(400).json({
          success: false,
          error: 'error' in resolvedType ? resolvedType.error : 'Invalid conversation type',
        });
      }

      const hasValidModelObject = !!model && typeof model === 'object' && !Array.isArray(model);

      // Validate required fields
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: message (and one of type/cli)',
        });
      }
      if (resolvedType.type === 'gemini' && !hasValidModelObject) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: model (required for gemini conversations)',
        });
      }
      if (model !== undefined && !hasValidModelObject) {
        return res.status(400).json({
          success: false,
          error: 'Invalid model. Expected an object',
        });
      }
      if (req.body?.configOptionValues !== undefined && configOptionValues === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Invalid configOptionValues. Expected an object whose values are strings.',
        });
      }

      const type = resolvedType.type;
      const resolvedBackend = backend || resolvedType.backendFromCli;
      const effectiveModel = (hasValidModelObject ? model : getFallbackConversationModel()) as TProviderWithModel;
      const conversationTitle = buildConversationTitleFromMessage(message);
      if (type === 'acp' && !resolvedBackend) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: backend (required when type/acp cli is acp)',
        });
      }

      // Create conversation
      const conversation = await conversationServiceSingleton.createConversation({
        type,
        model: effectiveModel,
        extra: {
          workspace,
          backend: resolvedBackend as (typeof VALID_ACP_BACKENDS)[number] | undefined,
          customWorkspace: !!workspace,
          cliPath,
          sessionMode: mode,
          currentModelId,
          codexModel,
          configOptionValues,
          agentName,
          customAgentId,
        },
        name: conversationTitle || undefined,
        source: 'api',
      });

      // Send initial message
      const msg_id = uuid();
      if (waitForDispatch) {
        const sendResult = await dispatchConversationMessage(conversation.id, message, msg_id, conversation.type);
        if (!sendResult.success) {
          const errorMessage = 'msg' in sendResult ? sendResult.msg : 'Failed to send initial message';
          console.error('[API] Initial message send failed:', errorMessage);
          return res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      } else {
        void dispatchConversationMessage(conversation.id, message, msg_id, conversation.type)
          .then((sendResult) => {
            if (!sendResult.success) {
              console.error(
                '[API] Async initial message send failed:',
                'msg' in sendResult ? sendResult.msg : 'Failed to send initial message',
                {
                  sessionId: conversation.id,
                  msg_id,
                }
              );
            }
          })
          .catch((dispatchError) => {
            console.error('[API] Async initial message send exception:', dispatchError, {
              sessionId: conversation.id,
              msg_id,
            });
          });
      }

      recordConversationApiDiagnostics({
        route: '/api/v1/conversation/create',
        reason: waitForDispatch ? 'conversation_created_waited' : 'conversation_created_async',
        sessionId: conversation.id,
      });

      res.json({
        success: true,
        sessionId: conversation.id,
        status: 'running',
      });
    } catch (error) {
      console.error('[API] Create conversation error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * POST /api/v1/conversation/simulate
 * Simulate request examples for integration testing
 */
router.post(
  '/simulate',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const rawAction = typeof req.body?.action === 'string' ? req.body.action : 'create';
      const action = rawAction as SimulationAction;

      if (!SIMULATION_ACTIONS.includes(action)) {
        return res.status(400).json({
          success: false,
          error: `Invalid action. Must be one of: ${SIMULATION_ACTIONS.join(', ')}`,
        });
      }

      const sessionId =
        typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
          ? req.body.sessionId.trim()
          : 'conv_example_001';
      const payload =
        req.body?.payload && typeof req.body.payload === 'object' ? (req.body.payload as Record<string, unknown>) : {};

      const simulation = buildSimulationPayload(action, sessionId, payload);

      res.json({
        success: true,
        simulation,
      });
    } catch (error) {
      console.error('[API] Simulate request error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/status?sessionId={sessionId}
 * Query conversation status
 * 查询会话状态
 */
router.get(
  '/status',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionId = parseSessionIdQuery(req);

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing sessionId query parameter',
        });
      }

      const db = await getDatabase();

      // Get conversation
      const convResult = db.getConversation(sessionId);
      if (!convResult.success || !convResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const snapshot = getReadOnlyConversationStatusSnapshot(sessionId);
      if (!snapshot) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      recordConversationApiDiagnostics({
        route: '/api/v1/conversation/status',
        reason: 'status_poll',
        sessionId,
      });

      res.json({
        success: true,
        sessionId,
        status: snapshot.status,
        state: snapshot.state,
        category: getConversationStatusCategory(snapshot.state),
        detail: snapshot.detail,
        canSendMessage: snapshot.canSendMessage,
        isWorking: isConversationStatusWorking(snapshot.state),
        runtime: snapshot.runtime,
        lastMessage: formatStatusLastMessage(snapshot.lastMessage),
      });
    } catch (error) {
      console.error('[API] Get status error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/debug/runtime
 * Developer-only runtime diagnostics for conversation API flows
 */
router.get(
  '/debug/runtime',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionId = parseSessionIdQuery(req);
      const persist = parseOptionalBoolean(req.query?.persist) ?? true;
      const capture = apiDiagnosticsService.captureRouteSample({
        route: '/api/v1/conversation/debug/runtime',
        reason: 'manual_runtime_snapshot',
        sessionId,
        force: true,
        persist,
        allowWhenDisabled: true,
      });

      res.json({
        success: true,
        config: apiDiagnosticsService.getConfig(),
        recorded: capture.recorded,
        filePath: capture.filePath,
        snapshot: capture.snapshot,
      });
    } catch (error) {
      console.error('[API] Get runtime diagnostics error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/status/list
 * List conversations with current status
 */
router.get(
  '/status/list',
  wrapAsyncRoute(async (_req: Request, res: Response, _next: NextFunction) => {
    try {
      const scopeQuery = parseConversationListScope(_req.query?.scope);
      const status = parseListQueryValues(_req.query?.status) as ConversationStatusValue[] | undefined;
      const state = parseListQueryValues(_req.query?.state) as ConversationRuntimeState[] | undefined;
      const type = parseListQueryValues(_req.query?.type) as TChatConversation['type'][] | undefined;
      const cli = parseListQueryValues(_req.query?.cli);
      const source = parseListQueryValues(_req.query?.source);
      const canSendMessage = parseOptionalBoolean(_req.query?.canSendMessage);
      const scope = resolveConversationStatusListScope({
        scope: scopeQuery,
        status,
        state,
      });

      const db = await getDatabase();
      const conversations = getConversationStatusListConversations(scope, { db });
      const items = buildConversationStatusList(conversations, {
        scope,
        status,
        state,
        type,
        cli,
        source,
        canSendMessage,
      });

      recordConversationApiDiagnostics({
        route: '/api/v1/conversation/status/list',
        reason: `status_list_${scope}`,
      });

      res.json({
        success: true,
        total: items.length,
        filters: {
          scope,
          status,
          state,
          type,
          cli,
          source,
          canSendMessage,
        },
        items,
      });
    } catch (error) {
      console.error('[API] List conversation status error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * POST /api/v1/conversation/stop?sessionId={sessionId}
 * Stop AI generation
 * 终止 AI 生成
 */
router.post(
  '/stop',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionId = parseSessionIdQuery(req);

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing sessionId query parameter',
        });
      }

      const db = await getDatabase();

      // Verify conversation exists
      const convResult = db.getConversation(sessionId);
      if (!convResult.success || !convResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      // Strong consistency: do not return success until stop is actually confirmed.
      const stopResult = await invokeStopWithTimeout(sessionId, STOP_DISPATCH_TIMEOUT_MS);
      if (!stopResult.success) {
        console.error('[API] Stop dispatch failed, forcing kill:', stopResult.msg, { sessionId });
        recordConversationApiDiagnostics({
          route: '/api/v1/conversation/stop',
          reason: 'stop_dispatch_failed',
          sessionId,
          force: true,
        });
        await drainConversationRuntime(sessionId);
      }

      try {
        await waitForStopConfirmed(sessionId, STOP_VERIFY_TIMEOUT_MS);
      } catch (verifyError) {
        // Final fallback: force kill once and verify quickly again.
        await drainConversationRuntime(sessionId);
        try {
          await waitForStopConfirmed(sessionId, 5000);
        } catch {
          recordConversationApiDiagnostics({
            route: '/api/v1/conversation/stop',
            reason: 'stop_confirmation_timeout',
            sessionId,
            force: true,
          });
          return res.status(504).json({
            success: false,
            error: verifyError instanceof Error ? verifyError.message : 'Stop confirmation failed',
          });
        }
      }

      // Update conversation status
      db.updateConversation(sessionId, { status: 'finished' });
      await drainConversationRuntime(sessionId);

      recordConversationApiDiagnostics({
        route: '/api/v1/conversation/stop',
        reason: 'conversation_stopped',
        sessionId,
        force: true,
      });

      res.json({
        success: true,
        sessionId,
        status: 'finished',
      });
    } catch (error) {
      console.error('[API] Stop conversation error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * POST /api/v1/conversation/message?sessionId={sessionId}
 * Continue conversation (send new message)
 * 持续对话（发送新消息）
 */
router.post(
  '/message',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionId = parseSessionIdQuery(req);
      const message = parseOptionalString(req.body?.message);
      const waitForDispatch = parseOptionalBoolean(req.body?.waitForDispatch) ?? false;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing sessionId query parameter',
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Missing message in request body',
        });
      }

      const db = await getDatabase();

      // Verify conversation exists
      const convResult = db.getConversation(sessionId);
      if (!convResult.success || !convResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const snapshot = getReadOnlyConversationStatusSnapshot(sessionId);
      if (!snapshot) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const resolvedStatus = snapshot;

      // Check if AI is busy or awaiting confirmation
      if (!resolvedStatus.canSendMessage) {
        return res.status(409).json({
          success: false,
          error: `Conversation is not ready for new input: ${resolvedStatus.state}`,
          status: 'ai-busy',
          state: resolvedStatus.state,
          detail: resolvedStatus.detail,
        });
      }

      // Send message
      const msg_id = uuid();
      if (waitForDispatch) {
        const sendResult = await dispatchConversationMessage(sessionId, message, msg_id, convResult.data.type);
        if (!sendResult.success) {
          const errorMessage = 'msg' in sendResult ? sendResult.msg : 'Failed to send message';
          console.error('[API] Continue message send failed:', errorMessage);
          return res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      } else {
        void dispatchConversationMessage(sessionId, message, msg_id, convResult.data.type)
          .then((sendResult) => {
            if (!sendResult.success) {
              console.error(
                '[API] Async continue message send failed:',
                'msg' in sendResult ? sendResult.msg : 'Failed to send message',
                {
                  sessionId,
                  msg_id,
                }
              );
            }
          })
          .catch((dispatchError) => {
            console.error('[API] Async continue message send exception:', dispatchError, {
              sessionId,
              msg_id,
            });
          });
      }

      res.json({
        success: true,
        sessionId,
        status: 'running',
      });
    } catch (error) {
      console.error('[API] Send message error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/messages?sessionId={sessionId}
 * Get conversation message history
 * 获取对话历史记录
 */
router.get(
  '/messages',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionId = parseSessionIdQuery(req);
      const page = parseInt((req.query.page as string) || '0');
      const pageSize = Math.min(parseInt((req.query.pageSize as string) || '50'), 100);

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing sessionId query parameter',
        });
      }

      const db = await getDatabase();

      // Verify conversation exists
      const convResult = db.getConversation(sessionId);
      if (!convResult.success || !convResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      // Get messages
      const result = db.getConversationMessages(sessionId, page, pageSize);

      res.json({
        success: true,
        messages: result.data,
        total: result.total,
        page,
        pageSize,
        hasMore: result.hasMore,
      });
    } catch (error) {
      console.error('[API] Get messages error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/usage/monitor?startTime={ms}&endTime={ms}
 * Get usage monitoring aggregates by agent/backend within a time range
 */
router.get(
  '/usage/monitor',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const rangeResult = parseConversationTokenUsageRange(req);
      if (!rangeResult.range) {
        return res.status(400).json({
          success: false,
          error: rangeResult.error || 'Invalid time range query parameters',
        });
      }

      const db = await getDatabase();
      const monitorResult = db.getConversationTokenUsageMonitor(rangeResult.range);
      if (!monitorResult.success || !monitorResult.data) {
        return res.status(500).json({
          success: false,
          error: monitorResult.error || 'Failed to load token usage monitor data',
        });
      }

      res.json(buildConversationUsageMonitorResponse(monitorResult.data));
    } catch (error) {
      console.error('[API] Get usage monitor error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/usage?sessionId={sessionId}
 * Get structured token usage summary and per-reply stats
 */
router.get(
  '/usage',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionId = parseSessionIdQuery(req);
      const page = parseInt((req.query.page as string) || '0');
      const pageSize = Math.min(parseInt((req.query.pageSize as string) || '50'), 100);
      const rangeResult = parseConversationTokenUsageRange(req);

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing sessionId query parameter',
        });
      }

      if (!rangeResult.range) {
        return res.status(400).json({
          success: false,
          error: rangeResult.error || 'Invalid time range query parameters',
        });
      }

      const db = await getDatabase();
      const convResult = db.getConversation(sessionId);
      if (!convResult.success || !convResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const summaryResult = db.getConversationTokenUsageSummary(sessionId, rangeResult.range);
      if (!summaryResult.success || !summaryResult.data) {
        return res.status(500).json({
          success: false,
          error: summaryResult.error || 'Failed to load conversation token usage summary',
        });
      }

      const usagePage = db.getConversationTokenUsage(sessionId, page, pageSize, 'DESC', rangeResult.range);

      res.json(
        buildConversationUsageResponse(sessionId, convResult.data, {
          summary: summaryResult.data,
          usagePage,
          range: rangeResult.range,
        })
      );
    } catch (error) {
      console.error('[API] Get usage error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/conversation/usage/list?sessionIds={id1,id2}
 * Get token usage summary for a batch of conversations
 */
router.get(
  '/usage/list',
  wrapAsyncRoute(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const sessionIds = parseListQueryValues(req.query?.sessionIds);
      const rangeResult = parseConversationTokenUsageRange(req);

      if (!sessionIds || sessionIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing sessionIds query parameter',
        });
      }

      if (!rangeResult.range) {
        return res.status(400).json({
          success: false,
          error: rangeResult.error || 'Invalid time range query parameters',
        });
      }

      const db = await getDatabase();
      const items: ConversationUsageSummaryListItem[] = [];
      const notFoundSessionIds: string[] = [];

      for (const sessionId of sessionIds) {
        const convResult = db.getConversation(sessionId);
        if (!convResult.success || !convResult.data) {
          notFoundSessionIds.push(sessionId);
          continue;
        }

        const summaryResult = db.getConversationTokenUsageSummary(sessionId, rangeResult.range);
        if (!summaryResult.success || !summaryResult.data) {
          return res.status(500).json({
            success: false,
            error: summaryResult.error || `Failed to load conversation token usage summary for ${sessionId}`,
          });
        }

        items.push({
          sessionId,
          conversationType: convResult.data.type,
          backend: convResult.data.type === 'acp' ? convResult.data.extra.backend : undefined,
          summary: summaryResult.data,
        });
      }

      res.json(buildConversationUsageSummaryListResponse(items, notFoundSessionIds, rangeResult.range));
    } catch (error) {
      console.error('[API] Get usage list error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

export default router;
