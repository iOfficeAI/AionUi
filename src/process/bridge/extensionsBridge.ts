/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  AgentActivityState,
  IExtensionAgentActivityEvent,
  IExtensionAgentActivityItem,
  IExtensionAgentActivitySnapshot,
} from '@/common/ipcBridge';
import type { TMessage } from '@/common/chatLib';
import type { TChatConversation } from '@/common/storage';
import { ExtensionRegistry } from '@/extensions';
import { getDatabase } from '@process/database';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';

const STATUS_TO_SYNCING = new Set(['connecting', 'connected', 'authenticated']);
const ACTIVITY_SNAPSHOT_TTL_MS = 3000;

let activitySnapshotCache: IExtensionAgentActivitySnapshot | null = null;
let activitySnapshotCachedAt = 0;
let activitySnapshotInFlight: Promise<IExtensionAgentActivitySnapshot> | null = null;

const normalizeRuntimeStatus = (status?: string): 'pending' | 'running' | 'finished' | 'unknown' => {
  if (status === 'pending' || status === 'running' || status === 'finished') return status;
  return 'unknown';
};

const mapStatusToState = (
  runtimeStatus: 'pending' | 'running' | 'finished' | 'unknown',
  lastStatus?: string,
  recentEvents: IExtensionAgentActivityEvent[] = []
): AgentActivityState => {
  if (lastStatus === 'error' || recentEvents.some((e) => /error|失败|异常/i.test(e.text))) return 'error';

  const hasWriteEvent = recentEvents.some((e) => /write|patch|edit|写入|修改|生成文件/i.test(e.text));
  const hasResearchEvent = recentEvents.some((e) => /search|web|fetch|crawl|调研|检索|搜索/i.test(e.text));
  const hasToolEvent = recentEvents.some((e) => e.kind === 'tool');

  if (runtimeStatus === 'pending' || (lastStatus && STATUS_TO_SYNCING.has(lastStatus))) return 'syncing';
  if (runtimeStatus === 'running' && hasWriteEvent) return 'writing';
  if (runtimeStatus === 'running' && hasResearchEvent) return 'researching';
  if (runtimeStatus === 'running' && hasToolEvent) return 'executing';
  return 'idle';
};

const resolveAgentIdentity = (conversation: TChatConversation): { backend: string; agentName: string } => {
  if (conversation.type === 'acp') {
    const backend = String(conversation.extra?.backend || 'acp');
    const agentName = String(conversation.extra?.agentName || backend);
    return { backend, agentName };
  }
  if (conversation.type === 'codex') {
    return { backend: 'codex', agentName: 'Codex' };
  }
  if (conversation.type === 'gemini') {
    return { backend: 'gemini', agentName: 'Gemini' };
  }
  if (conversation.type === 'openclaw-gateway') {
    const backend = String(conversation.extra?.backend || 'openclaw');
    const agentName = String(conversation.extra?.agentName || 'OpenClaw');
    return { backend, agentName };
  }
  return { backend: 'nanobot', agentName: 'NanoBot' };
};

const toEventText = (message: TMessage): { kind: 'status' | 'tool' | 'message'; text: string; at: number } | null => {
  const at = Number(message.createdAt || Date.now());
  if (message.type === 'agent_status') {
    const content = (message.content || {}) as { status?: string };
    return { kind: 'status', text: `状态: ${String(content.status || 'unknown')}`, at };
  }

  if (
    message.type === 'tool_call' ||
    message.type === 'acp_tool_call' ||
    message.type === 'codex_tool_call' ||
    message.type === 'tool_group'
  ) {
    return { kind: 'tool', text: '工具执行中', at };
  }

  if (message.type === 'text' && message.position === 'left') {
    const content = message.content as { content?: string };
    const text = String(content?.content || '').trim();
    if (!text) return null;
    return { kind: 'message', text: text.slice(0, 80), at };
  }

  return null;
};

const buildActivitySnapshot = (): IExtensionAgentActivitySnapshot => {
  const db = getDatabase();
  const conversations = db.getUserConversations(undefined, 0, 10000).data.filter((conv) => !conv.extra?.isHealthCheck);

  const rankedState: Record<AgentActivityState, number> = {
    error: 5,
    writing: 4,
    researching: 3,
    executing: 2,
    syncing: 1,
    idle: 0,
  };

  const byAgent = new Map<string, IExtensionAgentActivityItem>();
  let runningConversations = 0;

  for (const conversation of conversations) {
    const { backend, agentName } = resolveAgentIdentity(conversation);
    const task = workerTaskManager.getTask(conversation.id);
    const runtimeStatus = normalizeRuntimeStatus(task?.status || conversation.status);
    if (runtimeStatus === 'running' || runtimeStatus === 'pending') {
      runningConversations += 1;
    }

    const recentMessages = db.getConversationMessages(conversation.id, 0, 20, 'DESC').data;
    const events = recentMessages
      .map((m) => toEventText(m))
      .filter((e): e is { kind: 'status' | 'tool' | 'message'; text: string; at: number } => Boolean(e))
      .slice(0, 6)
      .map(
        (e): IExtensionAgentActivityEvent => ({
          conversationId: conversation.id,
          kind: e.kind,
          text: e.text,
          at: e.at,
        })
      );

    const lastStatus = recentMessages.find((m) => m.type === 'agent_status')?.content as
      | { status?: string }
      | undefined;
    const state = mapStatusToState(runtimeStatus, lastStatus?.status, events);

    const key = `${backend}::${agentName}`;
    const existing = byAgent.get(key);
    const latestEventAt = events[0]?.at || conversation.modifyTime || Date.now();

    if (!existing) {
      byAgent.set(key, {
        id: key,
        backend,
        agentName,
        state,
        runtimeStatus,
        conversations: 1,
        activeConversations: runtimeStatus === 'running' || runtimeStatus === 'pending' ? 1 : 0,
        lastActiveAt: latestEventAt,
        lastStatus: lastStatus?.status,
        currentTask: events[0]?.text || (runtimeStatus === 'running' ? '执行中' : '空闲'),
        recentEvents: events,
      });
      continue;
    }

    existing.conversations += 1;
    if (runtimeStatus === 'running' || runtimeStatus === 'pending') {
      existing.activeConversations += 1;
    }
    if (latestEventAt > existing.lastActiveAt) {
      existing.lastActiveAt = latestEventAt;
      existing.currentTask = events[0]?.text || existing.currentTask;
      existing.lastStatus = lastStatus?.status || existing.lastStatus;
    }

    if (runtimeStatus === 'running') {
      existing.runtimeStatus = 'running';
    } else if (runtimeStatus === 'pending' && existing.runtimeStatus !== 'running') {
      existing.runtimeStatus = 'pending';
    } else if (runtimeStatus === 'finished' && existing.runtimeStatus === 'unknown') {
      existing.runtimeStatus = 'finished';
    }

    if (rankedState[state] > rankedState[existing.state]) {
      existing.state = state;
    }

    existing.recentEvents = [...existing.recentEvents, ...events].sort((a, b) => b.at - a.at).slice(0, 6);
  }

  return {
    generatedAt: Date.now(),
    totalConversations: conversations.length,
    runningConversations,
    agents: Array.from(byAgent.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt),
  };
};

const getActivitySnapshot = async (): Promise<IExtensionAgentActivitySnapshot> => {
  const now = Date.now();
  if (activitySnapshotCache && now - activitySnapshotCachedAt <= ACTIVITY_SNAPSHOT_TTL_MS) {
    return activitySnapshotCache;
  }

  if (activitySnapshotInFlight) {
    return activitySnapshotInFlight;
  }

  activitySnapshotInFlight = Promise.resolve()
    .then(() => {
      const snapshot = buildActivitySnapshot();
      activitySnapshotCache = snapshot;
      activitySnapshotCachedAt = Date.now();
      return snapshot;
    })
    .finally(() => {
      activitySnapshotInFlight = null;
    });

  return activitySnapshotInFlight;
};

/**
 * Initialize IPC bridge for extension system.
 * Provides extension-contributed themes (and future extension data) to the renderer process.
 */
export function initExtensionsBridge(): void {
  // Get all extension-contributed CSS themes (converted to ICssTheme format)
  ipcBridge.extensions.getThemes.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getThemes();
    } catch (error) {
      console.error('[Extensions] Failed to get themes:', error);
      return [];
    }
  });

  // Get summary of all loaded extensions (with enabled/disabled status and permissions)
  ipcBridge.extensions.getLoadedExtensions.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getLoadedExtensions().map((ext) => ({
        name: ext.manifest.name,
        displayName: ext.manifest.displayName,
        version: ext.manifest.version,
        description: ext.manifest.description,
        source: ext.source,
        directory: ext.directory,
        enabled: registry.isExtensionEnabled(ext.manifest.name),
        riskLevel: registry.getExtensionRiskLevel(ext.manifest.name),
        hasLifecycle: !!(ext.manifest as any).lifecycle,
      }));
    } catch (error) {
      console.error('[Extensions] Failed to get loaded extensions:', error);
      return [];
    }
  });

  // Get all extension-contributed assistants
  ipcBridge.extensions.getAssistants.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getAssistants();
    } catch (error) {
      console.error('[Extensions] Failed to get assistants:', error);
      return [];
    }
  });

  // Get all extension-contributed ACP adapters
  ipcBridge.extensions.getAcpAdapters.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getAcpAdapters();
    } catch (error) {
      console.error('[Extensions] Failed to get ACP adapters:', error);
      return [];
    }
  });

  // Get all extension-contributed agents (autonomous agent presets)
  ipcBridge.extensions.getAgents.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getAgents();
    } catch (error) {
      console.error('[Extensions] Failed to get agents:', error);
      return [];
    }
  });

  // Get all extension-contributed MCP servers
  ipcBridge.extensions.getMcpServers.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getMcpServers();
    } catch (error) {
      console.error('[Extensions] Failed to get MCP servers:', error);
      return [];
    }
  });

  // Get all extension-contributed skills
  ipcBridge.extensions.getSkills.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getSkills();
    } catch (error) {
      console.error('[Extensions] Failed to get skills:', error);
      return [];
    }
  });

  // Get all extension-contributed settings tabs
  ipcBridge.extensions.getSettingsTabs.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getSettingsTabs();
    } catch (error) {
      console.error('[Extensions] Failed to get settings tabs:', error);
      return [];
    }
  });

  // Get extension-contributed WebUI metadata (api routes + static assets)
  ipcBridge.extensions.getWebuiContributions.provider(async () => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getWebuiContributions().map((item) => ({
        extensionName: item.extensionName,
        apiRoutes: (item.config.apiRoutes || []).map((route) => ({
          path: route.path,
          auth: route.auth !== false,
        })),
        staticAssets: (item.config.staticAssets || []).map((asset) => ({
          urlPrefix: asset.urlPrefix,
          directory: asset.directory,
        })),
      }));
    } catch (error) {
      console.error('[Extensions] Failed to get webui contributions:', error);
      return [];
    }
  });

  // Get activity snapshot for extension settings tabs (e.g. Star Office)
  ipcBridge.extensions.getAgentActivitySnapshot.provider(async () => {
    try {
      return await getActivitySnapshot();
    } catch (error) {
      console.error('[Extensions] Failed to build agent activity snapshot:', error);
      return {
        generatedAt: Date.now(),
        totalConversations: 0,
        runningConversations: 0,
        agents: [],
      };
    }
  });

  // Get merged extension i18n translations for a specific locale
  ipcBridge.extensions.getExtI18nForLocale.provider(async ({ locale }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getExtI18nForLocale(locale);
    } catch (error) {
      console.error('[Extensions] Failed to get ext i18n for locale:', error);
      return {};
    }
  });

  // --- Extension Management API (NocoBase-inspired) ---

  // Enable an extension
  ipcBridge.extensions.enableExtension.provider(async ({ name }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      const success = await registry.enableExtension(name);
      if (success) {
        ipcBridge.extensions.stateChanged.emit({ name, enabled: true });
      }
      return { success, msg: success ? undefined : `Failed to enable "${name}"` };
    } catch (error) {
      console.error(`[Extensions] Failed to enable "${name}":`, error);
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  // Disable an extension
  ipcBridge.extensions.disableExtension.provider(async ({ name, reason }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      const success = await registry.disableExtension(name, reason);
      if (success) {
        ipcBridge.extensions.stateChanged.emit({ name, enabled: false, reason });
      }
      return { success, msg: success ? undefined : `Failed to disable "${name}"` };
    } catch (error) {
      console.error(`[Extensions] Failed to disable "${name}":`, error);
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  // Get permission summary for an extension (Figma-inspired)
  ipcBridge.extensions.getPermissions.provider(async ({ name }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getExtensionPermissions(name);
    } catch (error) {
      console.error(`[Extensions] Failed to get permissions for "${name}":`, error);
      return [];
    }
  });

  // Get risk level for an extension
  ipcBridge.extensions.getRiskLevel.provider(async ({ name }) => {
    try {
      const registry = ExtensionRegistry.getInstance();
      return registry.getExtensionRiskLevel(name);
    } catch (error) {
      console.error(`[Extensions] Failed to get risk level for "${name}":`, error);
      return 'safe';
    }
  });
}
