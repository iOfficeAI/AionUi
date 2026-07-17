/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { agentRegistry } from '@process/agent/AgentRegistry';
import { isAgentKind } from '@/common/types/detectedAgent';
import { AcpConnection } from '@process/agent/acp/AcpConnection';
import { buildAcpModelInfo, summarizeAcpModelInfo } from '@process/agent/acp/modelInfo';
import { readCodexConfiguredModel } from '@process/agent/codex/appserver/codexCliConfig';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import AcpAgentManager from '@process/task/AcpAgentManager';
import { GeminiAgentManager } from '@process/task/GeminiAgentManager';
import { AionrsManager } from '@process/task/AionrsManager';
import CodexNativeAgentManager, {
  resolveCodexCliCommand,
} from '@process/agent/codex/appserver/CodexNativeAgentManager';
import { probeCodexModelInfo } from '@process/agent/codex/appserver/CodexModelProbe';
import { mcpService } from '@/process/services/mcpServices/McpService';
import { ipcBridge } from '@/common';
import { LegacyConnectorFactory } from '@process/acp/compat/LegacyConnectorFactory';
import { noopProtocolHandlers } from '@process/acp/types';
import { mainLog, mainWarn } from '@process/utils/mainLogger';
import * as os from 'os';
import { getDatabase } from '@process/services/database';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import { mergeCodexModelInfoWithDefaults } from '@/common/types/codex/codexModels';

function createPersistedCodexModelInfo(modelId: string): AcpModelInfo {
  return mergeCodexModelInfoWithDefaults({
    currentModelId: modelId,
    currentModelLabel: modelId,
    availableModels: [{ id: modelId, label: modelId }],
    canSwitch: false,
    source: 'models',
    sourceDetail: 'codex-stream',
  });
}

async function getPersistedCodexModelInfo(conversationId: string): Promise<AcpModelInfo | null> {
  try {
    const db = await getDatabase();
    const result = db.getConversation(conversationId);
    if (!result.success || !result.data) return null;

    const conversation = result.data as { type?: string; extra?: Record<string, unknown> };
    if (conversation.type !== 'codex' && conversation.extra?.codexNative !== true) return null;

    const modelId = conversation.extra?.currentModelId || conversation.extra?.codexModel || readCodexConfiguredModel();
    return typeof modelId === 'string' && modelId ? createPersistedCodexModelInfo(modelId) : null;
  } catch {
    return null;
  }
}

export function initAcpConversationBridge(workerTaskManager: IWorkerTaskManager): void {
  // Debug provider to check environment variables
  ipcBridge.acpConversation.checkEnv.provider(() => {
    return Promise.resolve({
      env: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[SET]' : '[NOT SET]',
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? '[SET]' : '[NOT SET]',
        NODE_ENV: process.env.NODE_ENV || '[NOT SET]',
      },
    });
  });

  ipcBridge.acpConversation.detectCliPath.provider(({ backend }) => {
    const agents = agentRegistry.getDetectedAgents();
    const agent = agents.find((a) => isAgentKind(a, 'acp') && a.backend === backend);

    if (agent && isAgentKind(agent, 'acp') && agent.cliPath) {
      return Promise.resolve({ success: true, data: { path: agent.cliPath } });
    }

    return Promise.resolve({
      success: false,
      msg: `${backend} CLI not found. Please install it and ensure it's accessible.`,
    });
  });

  // Get all detected execution engines, enriched with MCP transport support info.
  ipcBridge.acpConversation.getAvailableAgents.provider(() => {
    try {
      const agents = agentRegistry.getDetectedAgents();
      const enriched = agents.map((agent) => ({
        ...agent,
        supportedTransports: mcpService.getSupportedTransportsForAgent(agent),
      }));

      // Map to the IPC bridge response shape explicitly
      const data = enriched.map((agent) => ({
        backend: agent.backend,
        name: agent.name,
        kind: agent.kind,
        cliPath: 'cliPath' in agent ? (agent.cliPath as string | undefined) : undefined,
        supportedTransports: agent.supportedTransports,
        isExtension: 'isExtension' in agent ? (agent.isExtension as boolean | undefined) : undefined,
        extensionName: 'extensionName' in agent ? (agent.extensionName as string | undefined) : undefined,
        isPreset: 'isPreset' in agent ? (agent.isPreset as boolean | undefined) : undefined,
        customAgentId: 'customAgentId' in agent ? (agent.customAgentId as string | undefined) : undefined,
      }));
      return Promise.resolve({ success: true as const, data });
    } catch (error) {
      return Promise.resolve({
        success: false as const,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Refresh custom ACP agents after the user adds/edits/deletes one in Settings.
  ipcBridge.acpConversation.refreshCustomAgents.provider(async () => {
    await agentRegistry.refreshCustomAgents();
    return { success: true };
  });

  // Test custom agent connection - validates CLI exists and ACP handshake works
  ipcBridge.acpConversation.testCustomAgent.provider(async (params) => {
    const { testCustomAgentConnection } = await import('./testCustomAgentConnection');
    return testCustomAgentConnection(params);
  });

  // Check agent health by sending a real test message
  ipcBridge.acpConversation.checkAgentHealth.provider(async ({ backend }) => {
    const startTime = Date.now();

    // Step 1: Check if CLI is installed
    const agents = agentRegistry.getDetectedAgents();
    const agent = agents.find((a) => isAgentKind(a, 'acp') && a.backend === backend);
    const acpAgent = agent && isAgentKind(agent, 'acp') ? agent : undefined;

    // Skip CLI check for claude/codebuddy (uses npx) and codex (has its own detection)
    if (!acpAgent?.cliPath && backend !== 'claude' && backend !== 'codebuddy' && backend !== 'codex') {
      return {
        success: false,
        msg: `${backend} CLI not found`,
        data: { available: false, error: 'CLI not installed' },
      };
    }

    const tempDir = os.tmpdir();
    const cliPath = acpAgent?.cliPath;
    const acpArgs = acpAgent?.acpArgs;

    // Step 2: For ACP-based agents (claude, codex, gemini, qwen, etc.)
    const factory = new LegacyConnectorFactory();
    const client = factory.create(
      {
        agentBackend: backend,
        agentSource: 'builtin',
        agentId: `health-check-${backend}`,
        cwd: tempDir,
        command: cliPath,
        args: acpArgs,
      },
      noopProtocolHandlers
    );

    try {
      await client.start();
      const session = await client.createSession({ cwd: tempDir });
      await client.prompt(session.sessionId, [{ type: 'text', text: 'hi' }]);

      const latency = Date.now() - startTime;
      await client.close();

      return {
        success: true,
        data: { available: true, latency },
      };
    } catch (error) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      const lowerError = errorMsg.toLowerCase();

      if (
        lowerError.includes('auth') ||
        lowerError.includes('login') ||
        lowerError.includes('credential') ||
        lowerError.includes('api key') ||
        lowerError.includes('unauthorized') ||
        lowerError.includes('forbidden')
      ) {
        return {
          success: false,
          msg: `${backend} not authenticated`,
          data: { available: false, error: 'Not authenticated' },
        };
      }

      return {
        success: false,
        msg: `${backend} health check failed: ${errorMsg}`,
        data: { available: false, error: errorMsg },
      };
    }
  });

  ipcBridge.acpConversation.getMode.provider(({ conversationId }) => {
    const task = workerTaskManager.getTask(conversationId);
    if (
      !task ||
      !(
        task instanceof AcpAgentManager ||
        task instanceof GeminiAgentManager ||
        task instanceof AionrsManager ||
        task instanceof CodexNativeAgentManager
      )
    ) {
      return Promise.resolve({
        success: true,
        data: { mode: 'default', initialized: false },
      });
    }
    return Promise.resolve({ success: true, data: task.getMode() });
  });

  ipcBridge.acpConversation.getCapabilities.provider(async ({ conversationId }) => {
    const task = workerTaskManager.getTask(conversationId);
    if (!task || !(task instanceof AionrsManager)) {
      return {
        success: true,
        data: { capabilities: null, initialized: false },
      };
    }

    try {
      await task.waitUntilReady();
      return {
        success: true,
        data: {
          capabilities: task.getCapabilities(),
          initialized: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcBridge.acpConversation.getModelInfo.provider(async ({ conversationId }) => {
    let task = workerTaskManager.getTask(conversationId);
    if (task instanceof CodexNativeAgentManager) {
      return {
        success: true,
        data: { modelInfo: await task.loadModelInfo() },
      };
    }
    if (!task || !(task instanceof AcpAgentManager)) {
      const persistedModelInfo = await getPersistedCodexModelInfo(conversationId);
      if (persistedModelInfo && !task) {
        try {
          task = await workerTaskManager.getOrBuildTask(conversationId);
          if (task instanceof CodexNativeAgentManager) {
            return {
              success: true,
              data: { modelInfo: await task.loadModelInfo() },
            };
          }
        } catch {
          // Preserve the selected model when native probing is unavailable.
        }
      }
      return { success: true, data: { modelInfo: persistedModelInfo } };
    }
    return {
      success: true,
      data: { modelInfo: task.getModelInfo() },
    };
  });

  ipcBridge.acpConversation.probeModelInfo.provider(async ({ backend }) => {
    const agents = agentRegistry.getDetectedAgents();
    const detectedAgent = agents.find((item) => item.backend === backend);
    const tempDir = os.tmpdir();

    if (backend === 'codex') {
      try {
        const cliPath =
          detectedAgent && (isAgentKind(detectedAgent, 'codex') || isAgentKind(detectedAgent, 'acp'))
            ? detectedAgent.cliPath
            : undefined;
        const modelInfo = await probeCodexModelInfo({
          command: resolveCodexCliCommand(cliPath),
          cwd: tempDir,
          currentModelId: readCodexConfiguredModel(),
        });
        mainLog('[Codex native]', 'probeModelInfo completed', summarizeAcpModelInfo(modelInfo));
        return {
          success: true,
          data: { modelInfo, configOptions: [] },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        mainWarn('[Codex native]', 'probeModelInfo failed', errorMsg);
        return { success: false, msg: errorMsg };
      }
    }

    const agent = detectedAgent && isAgentKind(detectedAgent, 'acp') ? detectedAgent : undefined;
    const acpAgent = agent && isAgentKind(agent, 'acp') ? agent : undefined;

    if (!acpAgent?.cliPath && backend !== 'claude' && backend !== 'codebuddy') {
      return {
        success: false,
        msg: `${backend} CLI not found`,
      };
    }

    const connection = new AcpConnection();

    try {
      await connection.connect(backend, acpAgent?.cliPath, tempDir, acpAgent?.acpArgs);
      await connection.newSession(tempDir);

      const visibleModelInfo = buildAcpModelInfo(connection.getConfigOptions(), connection.getModels());
      return {
        success: true,
        data: {
          modelInfo: visibleModelInfo,
          configOptions:
            connection
              .getConfigOptions()
              ?.filter((option) => option.category !== 'model' && option.category !== 'mode') || [],
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, msg: errorMsg };
    } finally {
      try {
        await connection.disconnect();
      } catch {
        // Ignore cleanup failures for best-effort probes
      }
    }
  });

  // Set model for ACP agents
  // 设置 ACP 代理的模型
  ipcBridge.acpConversation.setModel.provider(async ({ conversationId, modelId }) => {
    try {
      const task = await workerTaskManager.getOrBuildTask(conversationId);
      if (!task || !(task instanceof AcpAgentManager)) {
        if (task instanceof CodexNativeAgentManager) {
          const previousModelId = task.getModelInfo()?.currentModelId || null;
          const modelInfo = await task.setModel(modelId);
          if (previousModelId !== modelInfo.currentModelId) {
            workerTaskManager.kill(conversationId);
          }
          return {
            success: true,
            data: { modelInfo },
          };
        }
        return {
          success: false,
          msg: 'Conversation not found or model switching is not supported',
        };
      }
      return {
        success: true,
        data: { modelInfo: await task.setModel(modelId) },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, msg: errorMsg };
    }
  });

  ipcBridge.acpConversation.setMode.provider(async ({ conversationId, mode }) => {
    try {
      const task = await workerTaskManager.getOrBuildTask(conversationId);
      if (!task) {
        return { success: false, msg: 'Conversation not found' };
      }
      if (
        !(
          task instanceof AcpAgentManager ||
          task instanceof GeminiAgentManager ||
          task instanceof AionrsManager ||
          task instanceof CodexNativeAgentManager
        )
      ) {
        return {
          success: false,
          msg: 'Mode switching not supported for this agent type',
        };
      }
      return await task.setMode(mode);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, msg: errorMsg };
    }
  });

  ipcBridge.acpConversation.getConfigOptions.provider(({ conversationId }) => {
    const task = workerTaskManager.getTask(conversationId);
    if (task instanceof CodexNativeAgentManager) {
      return Promise.resolve({
        success: true,
        data: { configOptions: task.getConfigOptions() },
      });
    }
    if (!task || !(task instanceof AcpAgentManager)) {
      return Promise.resolve({ success: true, data: { configOptions: [] } });
    }
    return Promise.resolve({
      success: true,
      data: { configOptions: task.getConfigOptions() },
    });
  });

  ipcBridge.acpConversation.setConfigOption.provider(async ({ conversationId, configId, value }) => {
    try {
      const task = await workerTaskManager.getOrBuildTask(conversationId);
      if (task instanceof CodexNativeAgentManager) {
        const configOptions = await task.setConfigOption(configId, value);
        return { success: true, data: { configOptions } };
      }
      if (!task || !(task instanceof AcpAgentManager)) {
        return {
          success: false,
          msg: 'Conversation not found or not an ACP agent',
        };
      }
      const configOptions = await task.setConfigOption(configId, value);
      return { success: true, data: { configOptions } };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, msg: errorMsg };
    }
  });
}
