/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@process/agent/acp/AcpDetector';
import { AcpConnection } from '@process/agent/acp/AcpConnection';
import { buildAcpModelInfo, summarizeAcpModelInfo } from '@process/agent/acp/modelInfo';
import { detectAionrs } from '@process/agent/aionrs/binaryResolver';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import AcpAgentManager from '@process/task/AcpAgentManager';
import { GeminiAgentManager } from '@process/task/GeminiAgentManager';
import { AionrsManager } from '@process/task/AionrsManager';
import { mcpService } from '@/process/services/mcpServices/McpService';
import { mainLog, mainWarn } from '@/process/utils/mainLogger';
import { ipcBridge } from '@/common';
import * as os from 'os';

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

  // 保留旧的detectCliPath接口用于向后兼容，但使用新检测器的结果
  ipcBridge.acpConversation.detectCliPath.provider(({ backend }) => {
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((a) => a.backend === backend);

    if (agent?.cliPath) {
      return Promise.resolve({ success: true, data: { path: agent.cliPath } });
    }

    return Promise.resolve({
      success: false,
      msg: `${backend} CLI not found. Please install it and ensure it's accessible.`,
    });
  });

  // 新的ACP检测接口 - 基于全局标记位
  // Enrich with MCP transport support info so the frontend can show accurate counts
  ipcBridge.acpConversation.getAvailableAgents.provider(() => {
    try {
      const agents = acpDetector.getDetectedAgents();
      const enriched = agents.map((agent) => ({
        ...agent,
        supportedTransports: mcpService.getSupportedTransportsForAgent(agent),
      }));

      // Detect aionrs binary (non-ACP, uses JSON Lines protocol)
      // Insert at front so Aion CLI appears before other agents (including Gemini)
      const aionrs = detectAionrs();
      if (aionrs.available) {
        const aionrsAgent = { backend: 'aionrs' as const, name: 'Aion CLI', cliPath: aionrs.path };
        enriched.unshift({
          ...aionrsAgent,
          supportedTransports: mcpService.getSupportedTransportsForAgent(aionrsAgent),
        } as (typeof enriched)[number]);
      }

      return Promise.resolve({ success: true, data: enriched });
    } catch (error) {
      return Promise.resolve({
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Refresh custom agents detection - called when custom agents config changes
  ipcBridge.acpConversation.refreshCustomAgents.provider(async () => {
    try {
      await acpDetector.refreshCustomAgents();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Test custom agent connection - validates CLI exists and ACP handshake works
  ipcBridge.acpConversation.testCustomAgent.provider(async (params) => {
    const { testCustomAgentConnection } = await import('./testCustomAgentConnection');
    return testCustomAgentConnection(params);
  });

  // Check agent health by sending a real test message
  // This is the most reliable way to verify an agent can actually respond
  ipcBridge.acpConversation.checkAgentHealth.provider(async ({ backend }) => {
    const startTime = Date.now();

    // Step 1: Check if CLI is installed
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((a) => a.backend === backend);

    // Skip CLI check for claude/codebuddy (uses npx) and codex (has its own detection)
    if (!agent?.cliPath && backend !== 'claude' && backend !== 'codebuddy' && backend !== 'codex') {
      return {
        success: false,
        msg: `${backend} CLI not found`,
        data: { available: false, error: 'CLI not installed' },
      };
    }

    const tempDir = os.tmpdir();

    // Step 2: For ACP-based agents (claude, codex, gemini, qwen, etc.)
    const connection = new AcpConnection();

    try {
      // Connect to the agent
      await connection.connect(backend, agent?.cliPath, tempDir, agent?.acpArgs);

      // Create a new session
      await connection.newSession(tempDir);

      // Send a minimal test message - just need to verify we can communicate
      // Using a simple prompt that should get a quick response
      await connection.sendPrompt('hi');

      // If we get here, the agent responded successfully
      const latency = Date.now() - startTime;

      // Clean up
      await connection.disconnect();

      return {
        success: true,
        data: { available: true, latency },
      };
    } catch (error) {
      // Clean up on error
      try {
        await connection.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      const lowerError = errorMsg.toLowerCase();

      // Check for authentication-related errors
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

  // Get current session mode for ACP/Gemini agents
  // 获取 ACP/Gemini 代理的当前会话模式
  // Use getTaskById (cache-only) to avoid spawning a worker process on read-only queries
  ipcBridge.acpConversation.getMode.provider(({ conversationId }) => {
    const task = workerTaskManager.getTask(conversationId);
    if (
      !task ||
      !(task instanceof AcpAgentManager || task instanceof GeminiAgentManager || task instanceof AionrsManager)
    ) {
      return Promise.resolve({
        success: true,
        data: { mode: 'default', initialized: false },
      });
    }
    return Promise.resolve({ success: true, data: task.getMode() });
  });

  // Get model info for ACP/Codex agents
  // 获取 ACP/Codex 代理的模型信息
  // Use getTaskById (cache-only) to avoid spawning a worker process on read-only queries
  ipcBridge.acpConversation.getModelInfo.provider(({ conversationId }) => {
    const task = workerTaskManager.getTask(conversationId);
    if (!task || !(task instanceof AcpAgentManager)) {
      return Promise.resolve({ success: true, data: { modelInfo: null } });
    }
    return Promise.resolve({
      success: true,
      data: { modelInfo: task.getModelInfo() },
    });
  });

  ipcBridge.acpConversation.probeModelInfo.provider(async ({ backend }) => {
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((item) => item.backend === backend);

    if (!agent?.cliPath && backend !== 'claude' && backend !== 'codebuddy' && backend !== 'codex') {
      return {
        success: false,
        msg: `${backend} CLI not found`,
      };
    }

    const connection = new AcpConnection();
    const tempDir = os.tmpdir();

    try {
      await connection.connect(backend, agent?.cliPath, tempDir, agent?.acpArgs);
      await connection.newSession(tempDir);

      const modelInfo = buildAcpModelInfo(connection.getConfigOptions(), connection.getModels());
      if (backend === 'codex') {
        const initializeResult = connection.getInitializeResponse() as unknown as Record<string, unknown> | null;
        mainLog('[ACP codex]', 'probeModelInfo completed', {
          initializeAgentInfo: initializeResult?.agentInfo || null,
          modelInfo: summarizeAcpModelInfo(modelInfo),
        });
      }

      return { success: true, data: { modelInfo } };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (backend === 'codex') {
        mainWarn('[ACP codex]', 'probeModelInfo failed', errorMsg);
      }
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
        return {
          success: false,
          msg: 'Conversation not found or not an ACP agent',
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

  // Set session mode for ACP/Gemini agents (claude, qwen, gemini, etc.)
  // 设置 ACP/Gemini 代理的会话模式（claude、qwen、gemini 等）
  ipcBridge.acpConversation.setMode.provider(async ({ conversationId, mode }) => {
    try {
      const task = await workerTaskManager.getOrBuildTask(conversationId);
      if (!task) {
        return { success: false, msg: 'Conversation not found' };
      }
      if (!(task instanceof AcpAgentManager || task instanceof GeminiAgentManager || task instanceof AionrsManager)) {
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

  // Get non-model config options for ACP agents (e.g., reasoning effort)
  // 获取 ACP 代理的非模型配置选项（如推理级别）
  // Use getTaskById (cache-only) to avoid spawning a worker process on read-only queries
  ipcBridge.acpConversation.getConfigOptions.provider(({ conversationId }) => {
    const task = workerTaskManager.getTask(conversationId);
    if (!task || !(task instanceof AcpAgentManager)) {
      return Promise.resolve({ success: true, data: { configOptions: [] } });
    }
    return Promise.resolve({
      success: true,
      data: { configOptions: task.getConfigOptions() },
    });
  });

  // Set a config option value for ACP agents (e.g., reasoning effort)
  // 设置 ACP 代理的配置选项值（如推理级别）
  ipcBridge.acpConversation.setConfigOption.provider(async ({ conversationId, configId, value }) => {
    try {
      const task = await workerTaskManager.getOrBuildTask(conversationId);
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
