/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import type { AcpBackend } from '../../../types/acpTypes';
import type { IMcpServer } from '../../../common/storage';
import { ClaudeMcpAgent } from './agents/ClaudeMcpAgent';
import { QwenMcpAgent } from './agents/QwenMcpAgent';
import { IflowMcpAgent } from './agents/IflowMcpAgent';
import { GeminiMcpAgent } from './agents/GeminiMcpAgent';
import { AionuiMcpAgent } from './agents/AionuiMcpAgent';
import { CodexMcpAgent } from './agents/CodexMcpAgent';
import type { IMcpProtocol, DetectedMcpServer, McpConnectionTestResult, McpSyncResult, McpSource } from './McpProtocol';

/**
 * MCP服务 - 负责协调各个Agent的MCP操作协议
 * 新架构：只定义协议，具体实现由各个Agent类完成
 *
 * Agent 类型说明：
 * - AcpBackend ('claude', 'qwen', 'iflow', 'gemini', 'codex'等): 支持的 ACP 后端
 * - 'aionui': @office-ai/aioncli-core (AionUi 本地管理的 Gemini 实现)
 */
export class McpService {
  private agents: Map<McpSource, IMcpProtocol>;

  constructor() {
    this.agents = new Map([
      ['claude', new ClaudeMcpAgent()],
      ['qwen', new QwenMcpAgent()],
      ['iflow', new IflowMcpAgent()],
      ['gemini', new GeminiMcpAgent()],
      ['aionui', new AionuiMcpAgent()], // AionUi 本地 @office-ai/aioncli-core
      ['codex', new CodexMcpAgent()],
    ]);
  }

  /**
   * 获取特定backend的agent实例
   */
  private getAgent(backend: McpSource): IMcpProtocol | undefined {
    return this.agents.get(backend);
  }

  /**
   * 从检测到的ACP agents中获取MCP配置（并发版本）
   *
   * 注意：此方法还会额外检测原生 Gemini CLI 的 MCP 配置，
   * 即使它在 ACP 配置中是禁用的（因为 fork 的 Gemini 用于 ACP）
   */
  async getAgentMcpConfigs(
    agents: Array<{
      backend: AcpBackend;
      name: string;
      cliPath?: string;
    }>
  ): Promise<DetectedMcpServer[]> {
    // 创建完整的检测列表，包含 ACP agents 和额外的 MCP-only agents
    const allAgentsToCheck = [...agents];

    // 检查是否需要添加原生 Gemini CLI（如果它不在 ACP agents 中）
    const hasNativeGemini = agents.some((a) => a.backend === 'gemini' && a.cliPath === 'gemini');
    if (!hasNativeGemini) {
      // 检查系统中是否安装了原生 Gemini CLI
      try {
        const isWindows = process.platform === 'win32';
        const whichCommand = isWindows ? 'where' : 'which';
        execSync(`${whichCommand} gemini`, { encoding: 'utf-8', stdio: 'pipe', timeout: 1000 });

        // 如果找到了原生 Gemini CLI，添加到检测列表
        allAgentsToCheck.push({
          backend: 'gemini' as AcpBackend,
          name: 'Google Gemini CLI',
          cliPath: 'gemini',
        });
        console.log('[McpService] Added native Gemini CLI for MCP detection');
      } catch {
        // 原生 Gemini CLI 未安装，跳过
      }
    }

    // 并发执行所有agent的MCP检测
    const promises = allAgentsToCheck.map(async (agent) => {
      try {
        // 跳过 fork 的 Gemini（backend='gemini' 且 cliPath=undefined）
        // fork 的 Gemini 的 MCP 配置应该由 AionuiMcpAgent 管理
        if (agent.backend === 'gemini' && !agent.cliPath) {
          console.log(`[McpService] Skipping fork Gemini (ACP only, MCP managed by AionuiMcpAgent)`);
          return null;
        }

        const agentInstance = this.getAgent(agent.backend);
        if (!agentInstance) {
          console.warn(`[McpService] No agent instance for backend: ${agent.backend}`);
          return null;
        }

        const servers = await agentInstance.detectMcpServers(agent.cliPath);
        console.log(`[McpService] Detected ${servers.length} MCP servers for ${agent.backend} (cliPath: ${agent.cliPath || 'default'})`);

        if (servers.length > 0) {
          return {
            source: agent.backend as McpSource,
            servers,
          };
        }
        return null;
      } catch (error) {
        console.warn(`[McpService] Failed to detect MCP servers for ${agent.backend}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((result): result is DetectedMcpServer => result !== null);
  }

  /**
   * 测试MCP服务器连接
   */
  async testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult> {
    // 使用第一个可用的agent进行连接测试，因为测试逻辑在基类中是通用的
    const firstAgent = this.agents.values().next().value;
    if (firstAgent) {
      return await firstAgent.testMcpConnection(server);
    }
    return { success: false, error: 'No agent available for connection testing' };
  }

  /**
   * 将MCP配置同步到所有检测到的agent
   */
  async syncMcpToAgents(
    mcpServers: IMcpServer[],
    agents: Array<{
      backend: AcpBackend;
      name: string;
      cliPath?: string;
    }>
  ): Promise<McpSyncResult> {
    // 只同步启用的MCP服务器
    const enabledServers = mcpServers.filter((server) => server.enabled);

    if (enabledServers.length === 0) {
      return { success: true, results: [] };
    }

    // 并发执行所有agent的MCP同步
    const promises = agents.map(async (agent) => {
      try {
        const agentInstance = this.getAgent(agent.backend);
        if (!agentInstance) {
          console.warn(`[McpService] Skipping MCP sync for unsupported backend: ${agent.backend}`);
          return {
            agent: agent.name,
            success: true,
          };
        }

        const result = await agentInstance.installMcpServers(enabledServers);
        return {
          agent: agent.name,
          success: result.success,
          error: result.error,
        };
      } catch (error) {
        return {
          agent: agent.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const results = await Promise.all(promises);

    const allSuccess = results.every((r) => r.success);

    return { success: allSuccess, results };
  }

  /**
   * 从所有检测到的agent中删除MCP配置
   */
  async removeMcpFromAgents(
    mcpServerName: string,
    agents: Array<{
      backend: AcpBackend;
      name: string;
      cliPath?: string;
    }>
  ): Promise<McpSyncResult> {
    // 并发执行所有agent的MCP删除
    const promises = agents.map(async (agent) => {
      try {
        const agentInstance = this.getAgent(agent.backend);
        if (!agentInstance) {
          console.warn(`[McpService] Skipping MCP removal for unsupported backend: ${agent.backend}`);
          return {
            agent: `${agent.backend}:${agent.name}`,
            success: true,
          };
        }

        const result = await agentInstance.removeMcpServer(mcpServerName);
        return {
          agent: `${agent.backend}:${agent.name}`,
          success: result.success,
          error: result.error,
        };
      } catch (error) {
        return {
          agent: `${agent.backend}:${agent.name}`,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const results = await Promise.all(promises);

    return { success: true, results };
  }
}

export const mcpService = new McpService();
