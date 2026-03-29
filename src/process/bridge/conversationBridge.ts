/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@process/agent/codex';
import { GeminiAgent, GeminiApprovalStore } from '@process/agent/gemini';
import type { TChatConversation } from '@/common/config/storage';
import type { IAgentManager } from '@process/task/IAgentManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { ipcBridge } from '@/common';
import { getSkillsDir, getBuiltinSkillsCopyDir, getSystemDir, ProcessChat } from '@process/utils/initStorage';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
import type OpenClawAgentManager from '../task/OpenClawAgentManager';
import { prepareFirstMessage } from '../task/agentUtils';
import { refreshTrayMenu } from '@process/utils/tray';
import { copyFilesToDirectory, readDirectoryRecursive } from '@process/utils';
import { computeOpenClawIdentityHash } from '@process/utils/openclawUtils';
import { migrateConversationToDatabase } from './migrationUtils';
import { ConversationSideQuestionService } from './services/ConversationSideQuestionService';

const refreshTrayMenuSafely = async (): Promise<void> => {
  try {
    await refreshTrayMenu();
  } catch (error) {
    console.warn('[conversationBridge] Failed to refresh tray menu:', error);
  }
};

export function initConversationBridge(
  conversationService: IConversationService,
  workerTaskManager: IWorkerTaskManager
): void {
  const sideQuestionService = new ConversationSideQuestionService(conversationService);

  const emitConversationListChanged = (
    conversation: Pick<TChatConversation, 'id' | 'source'>,
    action: 'created' | 'updated' | 'deleted'
  ) => {
    ipcBridge.conversation.listChanged.emit({
      conversationId: conversation.id,
      action,
      source: conversation.source || 'aionui',
    });
  };

  ipcBridge.openclawConversation.getRuntime.provider(async ({ conversation_id }) => {
    try {
      const conversation = await conversationService.getConversation(conversation_id);
      if (!conversation || conversation.type !== 'openclaw-gateway') {
        return { success: false, msg: 'OpenClaw conversation not found' };
      }
      const task = (await workerTaskManager.getOrBuildTask(conversation_id)) as unknown as
        | OpenClawAgentManager
        | undefined;
      if (!task || task.type !== 'openclaw-gateway') {
        return { success: false, msg: 'OpenClaw runtime not available' };
      }

      // Await bootstrap to ensure the agent is fully connected before returning runtime info.
      // Without this, getRuntime may return isConnected=false while the agent is still connecting.
      await task.bootstrap.catch(() => {});

      const diagnostics = task.getDiagnostics();
      const identityHash = await computeOpenClawIdentityHash(diagnostics.workspace || conversation.extra?.workspace);
      const conversationModel = (conversation as { model?: { useModel?: string } }).model;
      const extra = conversation.extra as
        | {
            cliPath?: string;
            gateway?: { cliPath?: string };
            runtimeValidation?: unknown;
          }
        | undefined;
      const gatewayCliPath = extra?.gateway?.cliPath;

      return {
        success: true,
        data: {
          conversationId: conversation_id,
          runtime: {
            workspace: diagnostics.workspace || conversation.extra?.workspace,
            backend: diagnostics.backend || conversation.extra?.backend,
            agentName: diagnostics.agentName || conversation.extra?.agentName,
            cliPath: diagnostics.cliPath || extra?.cliPath || gatewayCliPath,
            model: conversationModel?.useModel,
            sessionKey: diagnostics.sessionKey,
            isConnected: diagnostics.isConnected,
            hasActiveSession: diagnostics.hasActiveSession,
            identityHash,
          },
          expected: extra?.runtimeValidation,
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcBridge.conversation.create.provider(async (params): Promise<TChatConversation> => {
    const conversation = await conversationService.createConversation({
      ...params,
      source: 'aionui', // Mark conversations created by AionUI as aionui
    });
    emitConversationListChanged(conversation, 'created');
    await refreshTrayMenuSafely();
    return conversation;
  });

  // Manually reload conversation context (Gemini): inject recent history into memory
  ipcBridge.conversation.reloadContext.provider(async ({ conversation_id }) => {
    try {
      const task = (await workerTaskManager.getOrBuildTask(conversation_id)) as unknown as
        | GeminiAgentManager
        | AcpAgentManager
        | CodexAgentManager
        | undefined;
      if (!task) return { success: false, msg: 'conversation not found' };
      if (task.type !== 'gemini') return { success: false, msg: 'only supported for gemini' };

      await (task as GeminiAgentManager).reloadContext();
      return { success: true };
    } catch (e: unknown) {
      return {
        success: false,
        msg: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcBridge.conversation.getAssociateConversation.provider(async ({ conversation_id }) => {
    try {
      // Try to get current conversation via service
      let currentConversation: TChatConversation | undefined =
        await conversationService.getConversation(conversation_id);

      if (!currentConversation) {
        // Not in database, try file storage
        const history = await ProcessChat.get('chat.history');
        currentConversation = (history || []).find((item) => item.id === conversation_id);

        // Lazy migrate in background
        if (currentConversation) {
          void migrateConversationToDatabase(currentConversation);
        }
      }

      if (!currentConversation || !currentConversation.extra?.workspace) {
        return [];
      }

      let allConversations: TChatConversation[] = await conversationService.listAllConversations();

      // If database is empty or doesn't have enough conversations, merge with file storage
      const history = await ProcessChat.get('chat.history');
      if (allConversations.length < (history?.length || 0)) {
        // Database doesn't have all conversations yet, use file storage
        allConversations = history || [];

        // Lazy migrate all conversations in background
        void Promise.all(allConversations.map((conv) => migrateConversationToDatabase(conv)));
      }

      // Filter by workspace
      return allConversations.filter((item) => item.extra?.workspace === currentConversation.extra.workspace);
    } catch (error) {
      console.error('[conversationBridge] Failed to get associate conversations:', error);
      return [];
    }
  });

  ipcBridge.conversation.createWithConversation.provider(
    async ({ conversation, sourceConversationId, migrateCron }) => {
      try {
        const result = await conversationService.createWithMigration({
          conversation,
          sourceConversationId,
          migrateCron,
        });
        workerTaskManager.getOrBuildTask(result.id).catch((err) => {
          console.warn('[conversationBridge] Failed to pre-warm task after migration:', err);
        });
        emitConversationListChanged(result, 'created');
        if (sourceConversationId) {
          emitConversationListChanged({ id: sourceConversationId, source: conversation.source }, 'deleted');
        }
        await refreshTrayMenuSafely();
        return result;
      } catch (error) {
        console.error('[conversationBridge] Failed to create conversation with conversation:', error);
        return Promise.resolve(conversation);
      }
    }
  );

  ipcBridge.conversation.remove.provider(async ({ id }) => {
    try {
      // Get conversation source before deletion (for channel cleanup)
      const conversation = await conversationService.getConversation(id);
      const source = conversation?.source;

      // Kill the running task if exists
      workerTaskManager.kill(id);

      // If source is not 'aionui' (e.g., telegram), cleanup channel resources
      // 如果来源不是 aionui（如 telegram），需要清理 channel 相关资源
      if (source && source !== 'aionui') {
        try {
          // Dynamic import to avoid circular dependency
          const { getChannelManager } = await import('@process/channels/core/ChannelManager');
          const channelManager = getChannelManager();
          if (channelManager.isInitialized()) {
            await channelManager.cleanupConversation(id);
          }
        } catch (cleanupError) {
          console.warn('[conversationBridge] Failed to cleanup channel resources:', cleanupError);
          // Continue with deletion even if cleanup fails
        }
      }

      await conversationService.deleteConversation(id);
      if (conversation) {
        emitConversationListChanged(conversation, 'deleted');
      }
      await refreshTrayMenuSafely();
      return true;
    } catch (error) {
      console.error('[conversationBridge] Failed to remove conversation:', error);
      return false;
    }
  });

  ipcBridge.conversation.update.provider(
    async ({ id, updates, mergeExtra }: { id: string; updates: Partial<TChatConversation>; mergeExtra?: boolean }) => {
      try {
        const existing = await conversationService.getConversation(id);
        // Only gemini type has model, use 'in' check to safely access
        const prevModel = existing && 'model' in existing ? existing.model : undefined;
        const nextModel = 'model' in updates ? updates.model : undefined;
        const modelChanged = !!nextModel && JSON.stringify(prevModel) !== JSON.stringify(nextModel);
        // model change detection for task rebuild

        await conversationService.updateConversation(id, updates, mergeExtra);

        if (existing) {
          emitConversationListChanged(existing, 'updated');
        }

        // If model changed, kill running task to force rebuild with new model on next send
        if (modelChanged) {
          try {
            workerTaskManager.kill(id);
          } catch {
            // ignore kill error, will lazily rebuild later
          }
        }

        if ('name' in updates) {
          await refreshTrayMenuSafely();
        }

        return true;
      } catch (error) {
        console.error('[conversationBridge] Failed to update conversation:', error);
        return false;
      }
    }
  );

  // Pre-warm conversation bootstrap: trigger getOrBuildTask early so that
  // the worker is ready when the user sends their first message.
  // For ACP agents, also trigger initAgent() to start the CLI subprocess
  // (~7s). Stream events are suppressed during bootstrap (via `bootstrapping`
  // flag) to avoid triggering the sidebar loading spinner prematurely.
  ipcBridge.conversation.warmup.provider(async ({ conversation_id }) => {
    try {
      const task = await workerTaskManager.getOrBuildTask(conversation_id);
      if (task && task.type === 'acp') {
        await (task as unknown as AcpAgentManager).initAgent();
      }
    } catch {
      // Ignore errors — warmup is best-effort
    }
  });

  ipcBridge.conversation.reset.provider(({ id }) => {
    if (id) {
      workerTaskManager.kill(id);
    } else {
      workerTaskManager.clear();
    }
    return Promise.resolve();
  });

  ipcBridge.conversation.get.provider(async ({ id }) => {
    try {
      // Try to get conversation from service (database)
      const conversation = await conversationService.getConversation(id);
      if (conversation) {
        // Found in database, update status and return
        const task = workerTaskManager.getTask(id);
        return { ...conversation, status: task?.status || 'finished' };
      }

      // Not in database, try to load from file storage and migrate
      const history = await ProcessChat.get('chat.history');
      const fileConversation = (history || []).find((item) => item.id === id);
      if (fileConversation) {
        // Update status from running task without mutating the file storage object
        const task = workerTaskManager.getTask(id);

        // Lazy migrate this conversation to database in background
        void migrateConversationToDatabase(fileConversation);

        return { ...fileConversation, status: task?.status || 'finished' };
      }

      return undefined;
    } catch (error) {
      console.error('[conversationBridge] Failed to get conversation:', error);
      return undefined;
    }
  });

  const buildLastAbortController = (() => {
    let lastGetWorkspaceAbortController = new AbortController();
    return () => {
      lastGetWorkspaceAbortController.abort();
      return (lastGetWorkspaceAbortController = new AbortController());
    };
  })();

  ipcBridge.conversation.getWorkspace.provider(async ({ workspace, search, path }) => {
    try {
      const fileService = GeminiAgent.buildFileServer(workspace);
      return await readDirectoryRecursive(path, {
        root: workspace,
        fileService,
        abortController: buildLastAbortController(),
        maxDepth: 10, // 支持更深的目录结构 / Support deeper directory structures
        search: {
          text: search,
          onProcess(result) {
            void ipcBridge.conversation.responseSearchWorkSpace.invoke(result);
          },
        },
      }).then((res) => (res ? [res] : []));
    } catch (error) {
      // Catch abort / ENOENT errors to avoid unhandled rejection
      // (bridge provider callbacks have no .catch handler)
      if (error instanceof Error && (error.message.includes('aborted') || error.message.includes('ENOENT'))) {
        return [];
      }
      console.error('[conversationBridge] getWorkspace error:', error);
      return [];
    }
  });

  ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
    const task = workerTaskManager.getTask(conversation_id);
    if (!task) return { success: true, msg: 'conversation not found' };
    await task.stop();
    return { success: true };
  });

  ipcBridge.conversation.getSlashCommands.provider(async ({ conversation_id }) => {
    try {
      const conversation = await conversationService.getConversation(conversation_id);
      if (!conversation) {
        return { success: true, data: { commands: [] } };
      }

      if (conversation.type !== 'acp') {
        return { success: true, data: { commands: [] } };
      }

      // Use getTask (cache-only) to avoid spawning a worker process on read-only queries
      const task = workerTaskManager.getTask(conversation_id) as unknown as AcpAgentManager | undefined;
      if (!task || task.type !== 'acp') {
        return { success: true, data: { commands: [] } };
      }

      const commands = await task.loadAcpSlashCommands();
      return { success: true, data: { commands } };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcBridge.conversation.askSideQuestion.provider(async ({ conversation_id, question }) => {
    try {
      const result = await sideQuestionService.ask(conversation_id, question);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('[conversationBridge] /btw request failed', {
        conversationId: conversation_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 通用 sendMessage 实现 - 统一调用 IAgentManager.sendMessage
  // Generic sendMessage - dispatches via IAgentManager.sendMessage interface
  ipcBridge.conversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
    let task: IAgentManager | undefined;
    try {
      task = await workerTaskManager.getOrBuildTask(conversation_id);
    } catch (err) {
      console.error(`[conversationBridge] sendMessage: failed to get/build task: ${conversation_id}`, err);
      return {
        success: false,
        msg: err instanceof Error ? err.message : 'conversation not found',
      };
    }

    if (!task) {
      return { success: false, msg: 'conversation not found' };
    }

    // Copy files to workspace (unified for all agents)
    // Wrap in try-catch to prevent unhandled rejection when workspace directory is missing
    // (bridge library does not attach .catch to provider promises)
    let workspaceFiles: string[];
    try {
      workspaceFiles = await copyFilesToDirectory(task.workspace, files, false, getSystemDir().cacheDir);
    } catch (error) {
      console.error('[conversationBridge] sendMessage: failed to copy files to workspace:', error);
      workspaceFiles = [];
    }

    // Precompute agent content with optional skill injection.
    // OpenClaw uses full-content mode: inject full skill text rather than index paths,
    // because the CLI may not proactively read SKILL.md files the way ACP agents do.
    let agentContent = other.input;
    if (other.injectSkills?.length) {
      agentContent = await prepareFirstMessage(other.input, {
        enabledSkills: other.injectSkills,
      });
      // Provide absolute skills directory so agent can resolve relative script paths
      // e.g. "skills/star-office-helper/scripts/..." → "${skillsDir}/star-office-helper/scripts/..."
      const skillsDir = getSkillsDir();
      const builtinSkillsCopyDir = getBuiltinSkillsCopyDir();
      agentContent = agentContent.replace(
        '[User Request]',
        `[Skills Directory]\nBuiltin skills: ${builtinSkillsCopyDir}\nUser skills: ${skillsDir}\nWhen skill instructions reference relative paths like "skills/{name}/scripts/...", resolve them under the appropriate directory.\n\n[User Request]`
      );
    }

    try {
      // Pass unified data — each agent reads the fields it needs from the unknown payload.
      // `content` aliases `input` for ACP/Codex/NanoBot/OpenClaw agents.
      // `agentContent` carries the skill-injected text for OpenClaw (equals `input` when no skills).
      await task.sendMessage({
        ...other,
        content: other.input,
        files: workspaceFiles,
        agentContent,
      });
      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        msg: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 通用 confirmMessage 实现 - 自动根据 conversation 类型分发

  ipcBridge.conversation.confirmation.confirm.provider(async ({ conversation_id, msg_id, data, callId }) => {
    const task = workerTaskManager.getTask(conversation_id);
    if (!task) return { success: false, msg: 'conversation not found' };
    task.confirm(msg_id, callId, data);
    return { success: true };
  });
  ipcBridge.conversation.confirmation.list.provider(async ({ conversation_id }) => {
    const task = workerTaskManager.getTask(conversation_id);
    if (!task) return [];
    return task.getConfirmations();
  });

  // Session-level approval memory for "always allow" decisions
  // 会话级别的权限记忆，用于 "always allow" 决策
  // Keys are parsed from raw action+commandType here (single source of truth)
  // Keys 在此处从原始 action+commandType 解析（单一数据源）
  ipcBridge.conversation.approval.check.provider(async ({ conversation_id, action, commandType }) => {
    const task = workerTaskManager.getTask(conversation_id) as unknown as GeminiAgentManager | undefined;
    if (!task || task.type !== 'gemini' || !task.approvalStore) {
      return false;
    }
    const keys = GeminiApprovalStore.createKeysFromConfirmation(action, commandType);
    if (keys.length === 0) return false;
    return task.approvalStore.allApproved(keys);
  });
}
