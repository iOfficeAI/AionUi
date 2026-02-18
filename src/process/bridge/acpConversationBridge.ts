/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { acpDetector } from '@/agent/acp/AcpDetector';
import { AcpConnection } from '@/agent/acp/AcpConnection';
import { CodexConnection } from '@/agent/codex/connection/CodexConnection';
import type { AcpBackendAll } from '@/types/acpTypes';
import { toolRegistry } from '../services/toolRegistry';
import WorkerManage from '@/process/WorkerManage';
import AcpAgentManager from '@/process/task/AcpAgentManager';
import CodexAgentManager from '@/process/task/CodexAgentManager';
import { GeminiAgentManager } from '@/process/task/GeminiAgentManager';
import { ipcBridge } from '../../common';
import * as os from 'os';

export function initAcpConversationBridge(): void {
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

    return Promise.resolve({ success: false, msg: `${backend} CLI not found. Please install it and ensure it's accessible.` });
  });

  // 新的ACP检测接口 - 基于全局标记位
  ipcBridge.acpConversation.getAvailableAgents.provider(() => {
    try {
      const agents = acpDetector.getDetectedAgents();
      return Promise.resolve({ success: true, data: agents });
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

    // Step 2: Handle Codex separately - it uses MCP protocol, not ACP
    if (backend === 'codex') {
      const codexConnection = new CodexConnection();
      try {
        // Start Codex MCP server
        await codexConnection.start(agent?.cliPath || 'codex', tempDir);

        // Wait for server to be ready and ping it
        await codexConnection.waitForServerReady(15000);
        const pingResult = await codexConnection.ping(5000);

        if (!pingResult) {
          throw new Error('Codex server not responding to ping');
        }

        const latency = Date.now() - startTime;
        void codexConnection.stop();

        return {
          success: true,
          data: { available: true, latency },
        };
      } catch (error) {
        try {
          void codexConnection.stop();
        } catch {
          // Ignore stop errors
        }

        const errorMsg = error instanceof Error ? error.message : String(error);
        const lowerError = errorMsg.toLowerCase();

        if (lowerError.includes('auth') || lowerError.includes('login') || lowerError.includes('api key') || lowerError.includes('not found') || lowerError.includes('command not found')) {
          return {
            success: false,
            msg: `codex not available`,
            data: { available: false, error: errorMsg },
          };
        }

        return {
          success: false,
          msg: `codex health check failed: ${errorMsg}`,
          data: { available: false, error: errorMsg },
        };
      }
    }

    // Step 3: For ACP-based agents (claude, gemini, qwen, etc.)
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
      connection.disconnect();

      return {
        success: true,
        data: { available: true, latency },
      };
    } catch (error) {
      // Clean up on error
      try {
        connection.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      const lowerError = errorMsg.toLowerCase();

      // Check for authentication-related errors
      if (lowerError.includes('auth') || lowerError.includes('login') || lowerError.includes('credential') || lowerError.includes('api key') || lowerError.includes('unauthorized') || lowerError.includes('forbidden')) {
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

  // Get CLI tools list from registry (fast, no CLI execution)
  ipcBridge.acpConversation.getCliToolsList.provider(() => {
    const results = Object.entries(toolRegistry.getAcpBackendsAll())
      .filter(([id, config]) => {
        if (id === 'gemini' || id === 'custom') return false;
        return config.enabled && config.cliCommand;
      })
      .map(([id, config]) => ({
        backend: id as AcpBackendAll,
        name: config.name,
        cliCommand: config.cliCommand,
        installCommand: config.installCommand,
        installUrl: config.installUrl,
      }));

    return Promise.resolve({ success: true, data: results });
  });

  // Check a single CLI tool's installed status and version
  ipcBridge.acpConversation.checkCliToolStatus.provider(({ backend }) => {
    const backendId = backend as AcpBackendAll;
    const detectedAgents = acpDetector.getDetectedAgents();
    const detected = detectedAgents.find((a) => a.backend === backendId);
    const installed = !!detected?.cliPath;

    let version: string | undefined;
    if (installed && detected?.cliPath) {
      try {
        const output = execSync(`${detected.cliPath} --version`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 5000,
        }).trim();
        const versionMatch = output.match(/v?(\d+\.\d+[.\d]*[-\w]*)/);
        version = versionMatch ? versionMatch[0] : output.split('\n')[0].trim();
      } catch {
        version = undefined;
      }
    }

    return Promise.resolve({ success: true, data: { backend: backendId, installed, version } });
  });

  // Get CLI version info for all known backends
  ipcBridge.acpConversation.getCliVersions.provider(() => {
    const detectedAgents = acpDetector.getDetectedAgents();

    const results = Object.entries(toolRegistry.getAcpBackendsAll())
      .filter(([id, config]) => {
        // Exclude gemini (built-in) and custom (user-configured)
        if (id === 'gemini' || id === 'custom') return false;
        return config.enabled && config.cliCommand;
      })
      .map(([id, config]) => {
        const backendId = id as AcpBackendAll;
        const detected = detectedAgents.find((a) => a.backend === backendId);
        const installed = !!detected?.cliPath;

        let version: string | undefined;
        if (installed && detected?.cliPath) {
          try {
            const output = execSync(`${detected.cliPath} --version`, {
              encoding: 'utf-8',
              stdio: 'pipe',
              timeout: 5000,
            }).trim();
            // Extract version from output - often contains extra text
            const versionMatch = output.match(/v?(\d+\.\d+[.\d]*[-\w]*)/);
            version = versionMatch ? versionMatch[0] : output.split('\n')[0].trim();
          } catch {
            // Version command failed - CLI may not support --version
            version = undefined;
          }
        }

        return {
          backend: backendId,
          name: config.name,
          installed,
          version,
          cliCommand: config.cliCommand,
          installCommand: config.installCommand,
          installUrl: config.installUrl,
        };
      });

    return Promise.resolve({ success: true, data: results });
  });

  // Install a CLI tool via its install command
  ipcBridge.acpConversation.installCli.provider(async ({ backend }) => {
    const backendId = backend as AcpBackendAll;
    const backendConfig = toolRegistry.getAcpBackendsAll()[backendId];

    if (!backendConfig?.installCommand) {
      return {
        success: false,
        msg: `No install command available for ${backendConfig?.name || backend}. Please visit ${backendConfig?.installUrl || 'the documentation'} to install manually.`,
      };
    }

    try {
      console.log(`[ACP] Installing CLI: ${backendConfig.installCommand}`);
      const { stdout, stderr } = await execAsync(backendConfig.installCommand, {
        timeout: 120000, // 2 minute timeout for install
        env: { ...process.env },
      });

      const output = (stdout + (stderr ? `\n${stderr}` : '')).trim();
      console.log(`[ACP] Install completed for ${backend}:`, output.slice(0, 200));

      // Re-initialize detector to pick up the newly installed CLI
      await acpDetector.reinitialize();

      return {
        success: true,
        data: { output },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ACP] Install failed for ${backend}:`, errorMsg);
      return {
        success: false,
        msg: `Installation failed: ${errorMsg}`,
        data: { output: errorMsg },
      };
    }
  });

  // Setup/verify a CLI tool after installation
  ipcBridge.acpConversation.setupCli.provider(async ({ backend }) => {
    const backendId = backend as AcpBackendAll;
    const backendConfig = toolRegistry.getAcpBackendsAll()[backendId];

    if (!backendConfig?.setupCommand) {
      return {
        success: false,
        msg: `No setup command available for ${backendConfig?.name || backend}.`,
      };
    }

    try {
      console.log(`[ACP] Running setup for ${backend}: ${backendConfig.setupCommand}`);
      const { stdout, stderr } = await execAsync(backendConfig.setupCommand, {
        timeout: 30000,
        env: { ...process.env },
      });

      const output = (stdout + (stderr ? `\n${stderr}` : '')).trim();
      return {
        success: true,
        data: { output },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        msg: `Setup failed: ${errorMsg}`,
        data: { output: errorMsg },
      };
    }
  });

  // --- Message Queue Operations ---

  // Enqueue messages into the agent's message queue
  ipcBridge.acpConversation.enqueueMessages.provider(async ({ conversation_id, messages }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager | undefined;
    if (!task || task.type !== 'acp') {
      return { success: false, msg: 'ACP conversation not found' };
    }
    const messageIds = task.enqueueMessages(messages);
    return { success: true, data: { messageIds } };
  });

  // Get current message queue status
  ipcBridge.acpConversation.getQueueStatus.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager | undefined;
    if (!task || task.type !== 'acp') {
      return { success: false, msg: 'ACP conversation not found' };
    }
    const status = task.messageQueue.getStatus();
    return {
      success: true,
      data: {
        status: status.status,
        queueLength: status.queueLength,
        messages: status.messages.map((m) => ({
          id: m.id,
          content: m.content.substring(0, 200),
          source: m.source,
          priority: m.priority,
          enqueuedAt: m.enqueuedAt,
        })),
      },
    };
  });

  // Pause queue processing
  ipcBridge.acpConversation.pauseQueue.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager | undefined;
    if (!task || task.type !== 'acp') {
      return { success: false, msg: 'ACP conversation not found' };
    }
    task.messageQueue.pause();
    return { success: true };
  });

  // Resume queue processing
  ipcBridge.acpConversation.resumeQueue.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager | undefined;
    if (!task || task.type !== 'acp') {
      return { success: false, msg: 'ACP conversation not found' };
    }
    task.messageQueue.resume();
    return { success: true };
  });

  // Clear all pending messages from the queue
  ipcBridge.acpConversation.clearQueue.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager | undefined;
    if (!task || task.type !== 'acp') {
      return { success: false, msg: 'ACP conversation not found' };
    }
    task.messageQueue.clear();
    return { success: true };
  });

  // Get current session mode for ACP/Gemini agents
  // 获取 ACP/Gemini 代理的当前会话模式
  ipcBridge.acpConversation.getMode.provider(async ({ conversationId }) => {
    console.log(`[acpConversationBridge] getMode called: conversationId=${conversationId}`);
    try {
      const task = await WorkerManage.getTaskByIdRollbackBuild(conversationId);
      console.log(`[acpConversationBridge] getMode task: type=${task?.type}, isAcp=${task instanceof AcpAgentManager}, isGemini=${task instanceof GeminiAgentManager}, isCodex=${task instanceof CodexAgentManager}`);
      if (!task || !(task instanceof AcpAgentManager || task instanceof GeminiAgentManager || task instanceof CodexAgentManager)) {
        console.log(`[acpConversationBridge] getMode: task not ACP/Gemini/Codex, returning default`);
        return { success: true, data: { mode: 'default', initialized: false } };
      }
      const result = task.getMode();
      console.log(`[acpConversationBridge] getMode result:`, result);
      return { success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[acpConversationBridge] getMode error:', errorMsg);
      return { success: true, data: { mode: 'default', initialized: false } };
    }
  });

  // Set session mode for ACP/Gemini agents (claude, qwen, gemini, etc.)
  // 设置 ACP/Gemini 代理的会话模式（claude、qwen、gemini 等）
  ipcBridge.acpConversation.setMode.provider(async ({ conversationId, mode }) => {
    console.log(`[acpConversationBridge] setMode called: conversationId=${conversationId}, mode=${mode}`);
    try {
      // Use getTaskByIdRollbackBuild to load task from database if not in memory
      // 使用 getTaskByIdRollbackBuild 从数据库加载 task（如果不在内存中）
      const task = await WorkerManage.getTaskByIdRollbackBuild(conversationId);
      console.log(`[acpConversationBridge] Task found: type=${task?.type}`);

      if (!task) {
        return { success: false, msg: 'Conversation not found' };
      }

      // Only ACP and Gemini agents support mode switching
      console.log(`[acpConversationBridge] setMode: isAcp=${task instanceof AcpAgentManager}, isGemini=${task instanceof GeminiAgentManager}, isCodex=${task instanceof CodexAgentManager}`);
      if (!(task instanceof AcpAgentManager || task instanceof GeminiAgentManager || task instanceof CodexAgentManager)) {
        console.log(`[acpConversationBridge] setMode: task not ACP/Gemini/Codex, rejecting`);
        return { success: false, msg: 'Mode switching not supported for this agent type' };
      }

      const result = await task.setMode(mode);
      console.log(`[acpConversationBridge] setMode result:`, result);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[acpConversationBridge] setMode error:', errorMsg);
      return { success: false, msg: errorMsg };
    }
  });
}
