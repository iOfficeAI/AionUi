/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '../../../types/acpTypes';
import type { IMcpServer } from '../../../common/storage';
import { ClaudeMcpAgent } from './agents/ClaudeMcpAgent';
import { QwenMcpAgent } from './agents/QwenMcpAgent';
import { IflowMcpAgent } from './agents/IflowMcpAgent';
import { GeminiMcpAgent } from './agents/GeminiMcpAgent';
import type { IMcpProtocol, DetectedMcpServer, McpConnectionTestResult, McpSyncResult } from './McpProtocol';

/**
 * MCP服务 - 负责协调各个Agent的MCP操作协议
 * 新架构：只定义协议，具体实现由各个Agent类完成
 */
export class McpService {
  private agents: Map<AcpBackend, IMcpProtocol>;

  constructor() {
    this.agents = new Map([
      ['claude', new ClaudeMcpAgent()],
      ['qwen', new QwenMcpAgent()],
      ['iflow', new IflowMcpAgent()],
      ['gemini', new GeminiMcpAgent()],
    ]);
  }

  /**
   * 获取特定backend的agent实例
   */
  private getAgent(backend: AcpBackend): IMcpProtocol | undefined {
    return this.agents.get(backend);
  }

  /**
   * 从检测到的ACP agents中获取MCP配置（并发版本）
   */
  async getAgentMcpConfigs(
    agents: Array<{
      backend: AcpBackend;
      name: string;
      cliPath?: string;
    }>
  ): Promise<DetectedMcpServer[]> {
    const startTime = performance.now();

    // 并发执行所有agent的MCP检测 - 这是关键优化！
    const promises = agents.map(async (agent) => {
      const agentStartTime = performance.now();

      try {
        const agentInstance = this.getAgent(agent.backend);
        if (!agentInstance) {
          return null;
        }

        const servers = await agentInstance.detectMcpServers(agent.cliPath);
        const elapsedMs = (performance.now() - agentStartTime).toFixed(2);

        if (servers.length > 0) {
          return {
            source: agent.backend,
            servers,
          };
        } else {
        }
        return null;
      } catch (error) {
        const elapsedMs = (performance.now() - agentStartTime).toFixed(2);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const filteredResults = results.filter((result): result is DetectedMcpServer => result !== null);

    const totalElapsedMs = (performance.now() - startTime).toFixed(2);

    return filteredResults;
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
          return {
            agent: agent.name,
            success: false,
            error: `Unsupported agent backend: ${agent.backend}`,
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
          return {
            agent: `${agent.backend}:${agent.name}`,
            success: false,
            error: `Unsupported agent backend: ${agent.backend}`,
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
