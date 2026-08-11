/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import v8 from 'v8';
import { getPlatformServices } from '@/common/platform';
import WorkerManage from '@process/WorkerManage';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import {
  ConversationTurnCompletionService,
  formatStatusLastMessage,
  getReadOnlyConversationStatusSnapshot,
} from '@process/services/ConversationTurnCompletionService';
import { getConversationMessageCacheStats } from '@process/utils/message';
import { getDatabaseSync } from '@process/services/database';

type DiagnosticsSnapshotInput = {
  route: string;
  reason: string;
  sessionId?: string;
};

export type ApiDiagnosticsConfig = {
  enabled: boolean;
  outputDir: string;
  sampleIntervalMs: number;
};

type DiagnosticMessageContentSummary = {
  kind: string;
  serializedLength: number | null;
  preview: string | null;
  truncated: boolean;
};

type DiagnosticLastMessage = Omit<NonNullable<ReturnType<typeof formatStatusLastMessage>>, 'content'> & {
  content: string | null;
  contentSummary: DiagnosticMessageContentSummary | null;
  position?: string | null;
};

type ActiveRuntimeSession = {
  sessionId: string;
  conversationId: string;
  name: string;
  type: string;
  source: string;
  workspace: string | null;
  status: string;
  state: string;
  detail: string;
  canSendMessage: boolean;
  modifyTime: number;
  runtime: {
    hasTask: boolean;
    taskStatus?: string;
    isProcessing: boolean;
    pendingConfirmations: number;
    dbStatus?: string;
  };
  lastMessage?: DiagnosticLastMessage;
};

type ApiDiagnosticsPersistedConfig = Partial<ApiDiagnosticsConfig>;

type ApiDiagnosticsServiceConfig = Partial<ApiDiagnosticsConfig> & {
  configFilePath?: string;
};

export type ApiDiagnosticsHistoryEntry = {
  filePath?: string;
  snapshot: ReturnType<ApiDiagnosticsService['createSnapshot']>;
};

const DEFAULT_DIAGNOSTICS_INTERVAL_MS = 60_000;
const DEFAULT_DIAGNOSTICS_DIR = path.resolve(process.cwd(), '.aionui', 'diagnostics', 'api');
const DEFAULT_DIAGNOSTICS_CONFIG_FILE = 'api-diagnostics-config.json';
const MAX_RECENT_CAPTURES = 200;
const MAX_MESSAGE_PREVIEW_LENGTH = 240;

const parseEnabledFlag = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const normalizeOutputDir = (value: string | undefined): string => {
  const trimmed = value?.trim();
  return path.resolve(trimmed || DEFAULT_DIAGNOSTICS_DIR);
};

const normalizeSampleIntervalMs = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), 1000);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(parsed, 1000);
    }
  }

  return DEFAULT_DIAGNOSTICS_INTERVAL_MS;
};

const resolveDefaultConfigPath = (): string => {
  try {
    return path.join(getPlatformServices().paths.getDataDir(), 'config', DEFAULT_DIAGNOSTICS_CONFIG_FILE);
  } catch {
    return path.resolve(process.cwd(), '.aionui', 'diagnostics', DEFAULT_DIAGNOSTICS_CONFIG_FILE);
  }
};

const getSerializedLength = (value: unknown): number | null => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
};

const truncatePreview = (value: string): { preview: string; truncated: boolean } => {
  if (value.length <= MAX_MESSAGE_PREVIEW_LENGTH) {
    return {
      preview: value,
      truncated: false,
    };
  }

  return {
    preview: `${value.slice(0, MAX_MESSAGE_PREVIEW_LENGTH)}...`,
    truncated: true,
  };
};

const getMessageContentPreview = (content: unknown): DiagnosticMessageContentSummary | null => {
  if (content === null || content === undefined) {
    return null;
  }

  const kind = Array.isArray(content) ? 'array' : typeof content;
  const serializedLength = getSerializedLength(content);

  let rawPreview: string | null = null;
  if (typeof content === 'string') {
    rawPreview = content;
  } else if (typeof content === 'number' || typeof content === 'boolean' || typeof content === 'bigint') {
    rawPreview = String(content);
  } else if (typeof content === 'object') {
    const contentRecord = content as { content?: unknown };
    if (typeof contentRecord.content === 'string') {
      rawPreview = contentRecord.content;
    } else {
      const objectKeys = Object.keys(content as Record<string, unknown>);
      rawPreview = objectKeys.length > 0 ? `[${kind}:${objectKeys.slice(0, 6).join(', ')}]` : `[${kind}]`;
    }
  } else {
    rawPreview = kind;
  }

  const normalizedPreview = rawPreview ? truncatePreview(rawPreview) : null;
  return {
    kind,
    serializedLength,
    preview: normalizedPreview?.preview ?? null,
    truncated: normalizedPreview?.truncated ?? false,
  };
};

const formatDiagnosticLastMessage = (
  lastMessage: Parameters<typeof formatStatusLastMessage>[0]
): DiagnosticLastMessage | undefined => {
  const formatted = formatStatusLastMessage(lastMessage);
  if (!formatted) {
    return undefined;
  }

  const contentSummary = getMessageContentPreview(lastMessage?.content);
  return {
    ...formatted,
    content: contentSummary?.preview ?? null,
    contentSummary,
    position: lastMessage?.position ?? null,
  };
};

const sanitizeSessionSnapshot = (sessionId: string) => {
  const snapshot = getReadOnlyConversationStatusSnapshot(sessionId);
  if (!snapshot) {
    return null;
  }

  return {
    sessionId: snapshot.sessionId,
    conversationId: snapshot.conversation.id,
    type: snapshot.conversation.type,
    source: snapshot.conversation.source,
    status: snapshot.status,
    state: snapshot.state,
    detail: snapshot.detail,
    canSendMessage: snapshot.canSendMessage,
    runtime: snapshot.runtime,
    lastMessage: formatDiagnosticLastMessage(snapshot.lastMessage) ?? null,
  };
};

export class ApiDiagnosticsService {
  private enabled: boolean;
  private outputDir: string;
  private sampleIntervalMs: number;
  private readonly configFilePath: string;
  private readonly lastRecordedAt = new Map<string, number>();
  private readonly recentCaptures: ApiDiagnosticsHistoryEntry[] = [];
  private persistQueue: Promise<void> = Promise.resolve();
  private configPersistQueue: Promise<void> = Promise.resolve();

  constructor(initialConfig: ApiDiagnosticsServiceConfig = {}) {
    this.configFilePath = initialConfig.configFilePath
      ? path.resolve(initialConfig.configFilePath)
      : resolveDefaultConfigPath();

    const persistedConfig = this.readPersistedConfig();
    this.enabled =
      initialConfig.enabled ?? persistedConfig.enabled ?? parseEnabledFlag(process.env.AIONUI_API_DIAGNOSTICS);
    this.outputDir = normalizeOutputDir(
      initialConfig.outputDir ?? persistedConfig.outputDir ?? process.env.AIONUI_API_DIAGNOSTICS_DIR
    );
    this.sampleIntervalMs = normalizeSampleIntervalMs(
      initialConfig.sampleIntervalMs ??
        persistedConfig.sampleIntervalMs ??
        process.env.AIONUI_API_DIAGNOSTICS_INTERVAL_MS
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getConfig(): ApiDiagnosticsConfig {
    return {
      enabled: this.enabled,
      outputDir: this.outputDir,
      sampleIntervalMs: this.sampleIntervalMs,
    };
  }

  updateConfig(nextConfig: Partial<ApiDiagnosticsConfig>): ApiDiagnosticsConfig {
    if (typeof nextConfig.enabled === 'boolean') {
      this.enabled = nextConfig.enabled;
    }

    if (typeof nextConfig.outputDir === 'string') {
      this.outputDir = normalizeOutputDir(nextConfig.outputDir);
    }

    if (nextConfig.sampleIntervalMs !== undefined) {
      this.sampleIntervalMs = normalizeSampleIntervalMs(nextConfig.sampleIntervalMs);
    }

    this.persistConfig();
    return this.getConfig();
  }

  getRecentCaptures(limit = 20): ApiDiagnosticsHistoryEntry[] {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(Math.trunc(limit), 1) : 20;
    return this.recentCaptures.slice(-normalizedLimit);
  }

  createSnapshot(input: DiagnosticsSnapshotInput) {
    const db = getDatabaseSync();
    const conversationCount = db.getUserConversations(undefined, 0, 1).total;
    const messageCache = getConversationMessageCacheStats();
    const busyStates = Array.from(cronBusyGuard.getAllStates().entries()).map(([conversationId, state]) =>
      Object.assign({ conversationId }, state)
    );
    const turnCompletionState = ConversationTurnCompletionService.getInstance().getDebugState();
    const activeSessions = this.collectActiveSessions({
      sessionId: input.sessionId,
      busyStates,
      messageCacheConversationIds: messageCache.conversations.map((conversation) => conversation.conversationId),
      inFlightSessionIds: turnCompletionState.inFlightSessionIds,
    });

    return {
      timestamp: new Date().toISOString(),
      route: input.route,
      reason: input.reason,
      sessionId: input.sessionId ?? null,
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        uptimeSec: Math.round(process.uptime()),
        memoryUsage: process.memoryUsage(),
      },
      heap: {
        statistics: v8.getHeapStatistics(),
        spaces: v8.getHeapSpaceStatistics(),
      },
      runtime: {
        conversationCount,
        workerManage: WorkerManage.getDebugInfo(),
        busyGuard: {
          count: busyStates.length,
          states: busyStates,
        },
        messageCache,
        turnCompletion: turnCompletionState,
        activeSessions: {
          count: activeSessions.length,
          sessions: activeSessions,
        },
      },
      session: input.sessionId ? sanitizeSessionSnapshot(input.sessionId) : null,
    };
  }

  getLiveSnapshot(input: DiagnosticsSnapshotInput): ReturnType<ApiDiagnosticsService['createSnapshot']> {
    return this.createSnapshot(input);
  }

  captureRouteSample(
    input: DiagnosticsSnapshotInput & { force?: boolean; persist?: boolean; allowWhenDisabled?: boolean }
  ): {
    enabled: boolean;
    recorded: boolean;
    filePath?: string;
    snapshot?: ReturnType<ApiDiagnosticsService['createSnapshot']>;
  } {
    if (!this.enabled && !input.allowWhenDisabled) {
      return {
        enabled: false,
        recorded: false,
      };
    }

    const now = Date.now();
    const key = `${input.route}:${input.sessionId || 'global'}`;
    const lastRecordedAt = this.lastRecordedAt.get(key) || 0;
    if (!input.force && now - lastRecordedAt < this.sampleIntervalMs) {
      return {
        enabled: true,
        recorded: false,
      };
    }

    const snapshot = this.createSnapshot(input);
    this.lastRecordedAt.set(key, now);

    if (input.persist !== false) {
      const filePath = this.persistSnapshot(snapshot);
      this.recordCapture({
        filePath,
        snapshot,
      });

      return {
        enabled: this.enabled,
        recorded: true,
        snapshot,
        filePath,
      };
    }

    this.recordCapture({
      snapshot,
    });

    return {
      enabled: this.enabled,
      recorded: true,
      snapshot,
    };
  }

  private persistSnapshot(snapshot: ReturnType<ApiDiagnosticsService['createSnapshot']>): string {
    const filePath = path.join(
      this.outputDir,
      `conversation-api-diagnostics-${new Date().toISOString().slice(0, 10)}.ndjson`
    );
    const serializedSnapshot = `${JSON.stringify(snapshot)}\n`;

    this.persistQueue = this.persistQueue
      .catch((): void => undefined)
      .then(async () => {
        await fs.promises.mkdir(this.outputDir, { recursive: true });
        await fs.promises.appendFile(filePath, serializedSnapshot, 'utf8');
      })
      .catch((error) => {
        console.warn('[ApiDiagnostics] Failed to persist snapshot:', error, {
          filePath,
        });
      });

    return filePath;
  }

  private recordCapture(entry: ApiDiagnosticsHistoryEntry): void {
    this.recentCaptures.push(entry);
    if (this.recentCaptures.length > MAX_RECENT_CAPTURES) {
      this.recentCaptures.splice(0, this.recentCaptures.length - MAX_RECENT_CAPTURES);
    }
  }

  private readPersistedConfig(): ApiDiagnosticsPersistedConfig {
    try {
      if (!fs.existsSync(this.configFilePath)) {
        return {};
      }

      const raw = fs.readFileSync(this.configFilePath, 'utf8');
      if (!raw.trim()) {
        return {};
      }

      const parsed = JSON.parse(raw) as ApiDiagnosticsPersistedConfig;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.archiveInvalidConfig();
      }
      console.warn('[ApiDiagnostics] Failed to read persisted config:', error);
      return {};
    }
  }

  private archiveInvalidConfig(): void {
    try {
      if (!fs.existsSync(this.configFilePath)) {
        return;
      }
      const archivedPath = `${this.configFilePath}.corrupt-${Date.now()}`;
      fs.renameSync(this.configFilePath, archivedPath);
      console.warn(`[ApiDiagnostics] Archived invalid persisted config to ${archivedPath}`);
    } catch (archiveError) {
      console.warn('[ApiDiagnostics] Failed to archive invalid persisted config:', archiveError);
    }
  }

  private persistConfig(): void {
    const serializedConfig = JSON.stringify(this.getConfig(), null, 2);

    this.configPersistQueue = this.configPersistQueue
      .catch((): void => undefined)
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.configFilePath), { recursive: true });
        await fs.promises.writeFile(this.configFilePath, serializedConfig, 'utf8');
      })
      .catch((error) => {
        console.warn('[ApiDiagnostics] Failed to persist config:', error);
      });
  }

  private collectActiveSessions(input: {
    sessionId?: string;
    busyStates: Array<{ conversationId: string }>;
    messageCacheConversationIds: string[];
    inFlightSessionIds: string[];
  }): ActiveRuntimeSession[] {
    const db = getDatabaseSync();
    const candidates = new Map<string, number>();
    const now = Date.now();

    const addCandidate = (sessionId: string | null | undefined): void => {
      if (!sessionId) return;
      if (!candidates.has(sessionId)) {
        candidates.set(sessionId, now);
      }
    };

    const dbRuntimeResult =
      typeof db.getUserConversationsByStatuses === 'function'
        ? db.getUserConversationsByStatuses(['pending', 'running'], undefined, 200)
        : (() => {
            const allConversations = db.getUserConversations(undefined, 0, 10000).data || [];
            return {
              success: true,
              data: allConversations.filter((conversation) =>
                ['pending', 'running'].includes(conversation.status || '')
              ),
            };
          })();

    if (dbRuntimeResult.success && Array.isArray(dbRuntimeResult.data)) {
      dbRuntimeResult.data.forEach((conversation) => addCandidate(conversation.id));
    }

    WorkerManage.getDebugInfo().tasks.forEach((task) => addCandidate(task.id));
    input.busyStates.forEach((state) => addCandidate(state.conversationId));
    input.messageCacheConversationIds.forEach((conversationId) => addCandidate(conversationId));
    input.inFlightSessionIds.forEach((sessionId) => addCandidate(sessionId));
    addCandidate(input.sessionId);

    const sessions = Array.from(candidates.keys())
      .map((sessionId) => getReadOnlyConversationStatusSnapshot(sessionId))
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => !!snapshot)
      .filter(
        (snapshot) =>
          snapshot.sessionId === input.sessionId ||
          snapshot.status === 'pending' ||
          snapshot.status === 'running' ||
          snapshot.runtime.hasTask ||
          snapshot.runtime.isProcessing ||
          snapshot.runtime.pendingConfirmations > 0
      )
      .map((snapshot) => ({
        sessionId: snapshot.sessionId,
        conversationId: snapshot.conversation.id,
        name: snapshot.conversation.name,
        type: snapshot.conversation.type,
        source: snapshot.conversation.source || 'aionui',
        workspace:
          typeof snapshot.conversation.extra?.workspace === 'string' ? snapshot.conversation.extra.workspace : null,
        status: snapshot.status,
        state: snapshot.state,
        detail: snapshot.detail,
        canSendMessage: snapshot.canSendMessage,
        modifyTime: snapshot.conversation.modifyTime,
        runtime: snapshot.runtime,
        lastMessage: formatDiagnosticLastMessage(snapshot.lastMessage),
      }))
      .toSorted((left, right) => {
        const rank = (value: string): number => {
          if (value === 'running') return 0;
          if (value === 'pending') return 1;
          return 2;
        };

        return rank(left.status) - rank(right.status) || right.modifyTime - left.modifyTime;
      });

    return sessions;
  }
}

export const apiDiagnosticsService = new ApiDiagnosticsService();
