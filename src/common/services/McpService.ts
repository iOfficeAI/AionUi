/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);
import type { AcpBackend } from '../acpTypes';
import type { IMcpServer, IMcpServerTransport } from '../storage';

export interface DetectedMcpServer {
  source: AcpBackend;
  servers: IMcpServer[];
}

/**
 * MCP服务 - 负责检测和管理MCP配置
 */
export class McpService {
  /**
   * 从检测到的ACP agents中获取MCP配置
   */
  async getAgentMcpConfigs(agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>): Promise<DetectedMcpServer[]> {
    // 并发执行所有agent的MCP检测
    const promises = agents.map(async (agent) => {
      try {
        const servers = await this.getMcpConfigForAgent(agent.backend, agent.cliPath);
        if (servers.length > 0) {
          return {
            source: agent.backend,
            servers,
          };
        }
        return null;
      } catch (error) {
        console.warn(`Failed to get MCP config for ${agent.backend}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((result): result is DetectedMcpServer => result !== null);
  }

  /**
   * 获取特定agent的MCP配置
   */
  private async getMcpConfigForAgent(backend: AcpBackend, _cliPath?: string): Promise<IMcpServer[]> {
    switch (backend) {
      case 'claude':
        return this.getClaudeMcpConfig();
      case 'qwen':
        return this.getQwenMcpConfig();
      case 'iflow':
        return this.getIflowMcpConfig();
      case 'gemini':
        return this.getGeminiMcpConfig();
      default:
        return [];
    }
  }

  /**
   * 获取Claude Code的MCP配置
   */
  private async getClaudeMcpConfig(): Promise<IMcpServer[]> {
    try {
      // 方法1: 尝试使用Claude Code CLI命令获取MCP配置
      try {
        const { stdout: result } = await execAsync('claude mcp list --json', { timeout: 5000 });
        const mcpList = JSON.parse(result);

        if (mcpList && Array.isArray(mcpList)) {
          const servers: IMcpServer[] = [];
          const now = Date.now();

          for (const mcpItem of mcpList) {
            // 获取每个MCP服务器的详细信息
            try {
              const { stdout: detailResult } = await execAsync(`claude mcp get ${mcpItem.name} --json`, { timeout: 3000 });
              const mcpDetail = JSON.parse(detailResult);

              servers.push({
                id: `claude_${mcpItem.name}_${now}`,
                name: `${mcpItem.name} (Claude Code)`,
                description: mcpDetail.description || `Imported from Claude Code`,
                enabled: true,
                transport: {
                  type: 'stdio',
                  command: mcpDetail.command || mcpItem.command,
                  args: mcpDetail.args || mcpItem.args || [],
                  env: mcpDetail.env || {},
                },
                status: 'disconnected',
                createdAt: now,
                updatedAt: now,
              });
            } catch (detailError) {
              console.warn(`Failed to get details for MCP ${mcpItem.name}:`, detailError);
            }
          }

          if (servers.length > 0) {
            return servers;
          }
        }
      } catch (cliError) {
        console.warn('Claude Code CLI not available or failed:', cliError);
      }

      // 方法2: 回退到读取Claude Desktop配置文件
      const home = homedir();
      const configPaths = [
        join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
        join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
        join(home, '.config', 'claude', 'claude_desktop_config.json'), // Linux
      ];

      for (const configPath of configPaths) {
        if (existsSync(configPath)) {
          const configContent = readFileSync(configPath, 'utf-8');
          const config = JSON.parse(configContent);

          if (config.mcpServers) {
            return this.parseMcpServersConfig(config.mcpServers, 'claude');
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get Claude MCP config:', error);
    }

    return [];
  }

  /**
   * 获取Qwen Code的MCP配置
   */
  private async getQwenMcpConfig(): Promise<IMcpServer[]> {
    try {
      // 尝试通过Qwen CLI命令获取MCP配置
      const { stdout: result } = await execAsync('qwen mcp list', { timeout: 5000 });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
        return [];
      }

      // 解析文本输出
      const mcpServers: IMcpServer[] = [];
      const lines = result.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        // 查找格式如: "✓ server-name: npx -y 12306-mcp (stdio) - Connected"
        const match = trimmedLine.match(/✓\s+([^:]+):\s+([^(]+)\s+\(([^)]+)\)/);
        if (match) {
          const [, name, commandStr, transport] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          const transportType = transport as 'stdio' | 'sse' | 'http';

          mcpServers.push({
            id: `qwen_${name.trim()}`,
            name: name.trim(),
            transport:
              transportType === 'stdio'
                ? {
                    type: 'stdio',
                    command: command,
                    args: args,
                    env: {},
                  }
                : transportType === 'sse'
                  ? {
                      type: 'sse',
                      url: commandStr.trim(),
                    }
                  : {
                      type: 'http',
                      url: commandStr.trim(),
                    },
            tools: [],
            enabled: true,
            status: 'connected' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
          });
        }
      }

      return mcpServers;
    } catch (error) {
      console.warn('Failed to get Qwen Code MCP config:', error);
    }

    return [];
  }

  /**
   * 获取iFlow CLI的MCP配置
   */
  private async getIflowMcpConfig(): Promise<IMcpServer[]> {
    try {
      // 使用iFlow CLI list命令获取MCP配置
      const { stdout: result } = await execAsync('iflow mcp list', { timeout: 5000 });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
        return [];
      }

      // 解析文本输出
      const mcpServers: IMcpServer[] = [];
      const lines = result.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        // 查找格式如: "✓ server-name: npx -y 12306-mcp (stdio) - Connected"
        const match = trimmedLine.match(/✓\s+([^:]+):\s+([^(]+)\s+\(([^)]+)\)/);
        if (match) {
          const [, name, commandStr, transport] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          const transportType = transport as 'stdio' | 'sse' | 'http';

          mcpServers.push({
            id: `iflow_${name.trim()}`,
            name: name.trim(),
            transport:
              transportType === 'stdio'
                ? {
                    type: 'stdio',
                    command: command,
                    args: args,
                    env: {},
                  }
                : transportType === 'sse'
                  ? {
                      type: 'sse',
                      url: commandStr.trim(),
                    }
                  : {
                      type: 'http',
                      url: commandStr.trim(),
                    },
            tools: [],
            enabled: true,
            status: 'connected' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
          });
        }
      }

      return mcpServers;
    } catch (error) {
      console.warn('Failed to get iFlow CLI MCP config:', error);
    }
    return [];
  }

  /**
   * 获取Gemini CLI的MCP配置
   */
  private async getGeminiMcpConfig(): Promise<IMcpServer[]> {
    try {
      // 尝试通过Gemini CLI命令获取MCP配置
      const { stdout: result } = await execAsync('gemini mcp list', { timeout: 5000 });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
        return [];
      }

      // 解析文本输出（假设格式与iFlow类似）
      const mcpServers: IMcpServer[] = [];
      const lines = result.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        // 查找格式如: "✓ server-name: npx -y 12306-mcp (stdio) - Connected"
        const match = trimmedLine.match(/✓\s+([^:]+):\s+([^(]+)\s+\(([^)]+)\)/);
        if (match) {
          const [, name, commandStr, transport] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          const transportType = transport as 'stdio' | 'sse' | 'http';

          mcpServers.push({
            id: `gemini_${name.trim()}`,
            name: name.trim(),
            transport:
              transportType === 'stdio'
                ? {
                    type: 'stdio',
                    command: command,
                    args: args,
                    env: {},
                  }
                : transportType === 'sse'
                  ? {
                      type: 'sse',
                      url: commandStr.trim(),
                    }
                  : {
                      type: 'http',
                      url: commandStr.trim(),
                    },
            tools: [],
            enabled: true,
            status: 'connected' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
          });
        }
      }

      return mcpServers;
    } catch (error) {
      console.warn('Failed to get Gemini MCP config:', error);
    }

    return [];
  }

  /**
   * 解析MCP服务器配置
   */
  private parseMcpServersConfig(mcpServers: Record<string, any>, source: AcpBackend): IMcpServer[] {
    const servers: IMcpServer[] = [];
    const now = Date.now();

    for (const [name, config] of Object.entries(mcpServers)) {
      try {
        const transport: IMcpServerTransport = config.command
          ? {
              type: 'stdio',
              command: config.command,
              args: config.args || [],
              env: config.env || {},
            }
          : config.url?.includes('/sse')
            ? {
                type: 'sse',
                url: config.url,
              }
            : {
                type: 'http',
                url: config.url,
              };

        servers.push({
          id: `${source}_${name}_${now}`,
          name: `${name} (${source})`,
          description: config.description || `Imported from ${source}`,
          enabled: true,
          transport,
          status: 'disconnected',
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        console.warn(`Failed to parse MCP server config for ${name}:`, error);
      }
    }

    return servers;
  }

  /**
   * 测试MCP服务器连接
   */
  async testMcpConnection(server: IMcpServer): Promise<{ success: boolean; tools?: Array<{ name: string; description?: string }>; error?: string }> {
    try {
      // 根据transport类型测试连接
      switch (server.transport.type) {
        case 'stdio':
          return this.testStdioConnection(server.transport);
        case 'sse':
          return this.testSseConnection(server.transport);
        case 'http':
          return this.testHttpConnection(server.transport);
        default:
          return { success: false, error: 'Unsupported transport type' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试Stdio连接并获取工具列表
   */
  private async testStdioConnection(transport: { command: string; args?: string[]; env?: Record<string, string> }): Promise<{ success: boolean; tools?: Array<{ name: string; description?: string }>; error?: string }> {
    try {
      const { spawn } = await import('child_process');

      return new Promise((resolve) => {
        const child = spawn(transport.command, transport.args || [], {
          env: { ...process.env, ...transport.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let responseData = '';
        let errorData = '';
        let requestId = 1;

        const timeout = setTimeout(() => {
          child.kill();
          resolve({ success: false, error: 'Connection timeout' });
        }, 10000);

        const cleanup = () => {
          clearTimeout(timeout);
          if (!child.killed) {
            child.kill();
          }
        };

        child.stderr?.on('data', (data) => {
          errorData += data.toString();
        });

        child.stdout?.on('data', (data) => {
          responseData += data.toString();

          // 尝试解析 JSON-RPC 响应
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const response = JSON.parse(line.trim());

                // 处理 initialize 响应
                if (response.id === 1 && response.result) {
                  // 发送 tools/list 请求
                  const toolsRequest = {
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 2,
                    params: {},
                  };

                  child.stdin?.write(JSON.stringify(toolsRequest) + '\n');
                }

                // 处理 tools/list 响应
                if (response.id === 2 && response.result) {
                  cleanup();
                  const tools = response.result.tools || [];
                  resolve({
                    success: true,
                    tools: tools.map((tool: any) => ({
                      name: tool.name,
                      description: tool.description,
                    })),
                  });
                  return;
                }

                // 处理错误响应
                if (response.error) {
                  cleanup();
                  resolve({ success: false, error: response.error.message || 'MCP protocol error' });
                  return;
                }
              } catch (parseError) {
                // 忽略解析错误，继续等待更多数据
              }
            }
          }
        });

        child.on('error', (error) => {
          cleanup();
          resolve({ success: false, error: error.message });
        });

        child.on('exit', (code) => {
          cleanup();
          if (code !== 0) {
            resolve({ success: false, error: `Process exited with code ${code}. Error: ${errorData}` });
          } else {
            resolve({ success: false, error: 'Process exited without providing tools list' });
          }
        });

        // 启动后发送 initialize 请求
        child.on('spawn', () => {
          const initRequest = {
            jsonrpc: '2.0',
            method: 'initialize',
            id: requestId++,
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              clientInfo: {
                name: 'AionUi',
                version: '1.0.0',
              },
            },
          };

          child.stdin?.write(JSON.stringify(initRequest) + '\n');
        });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试SSE连接
   */
  private async testSseConnection(transport: { url: string }): Promise<{ success: boolean; tools?: Array<{ name: string; description?: string }>; error?: string }> {
    try {
      const response = await fetch(transport.url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      if (response.ok) {
        return { success: true, tools: [] };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试HTTP连接并获取工具列表
   */
  private async testHttpConnection(transport: { url: string }): Promise<{ success: boolean; tools?: Array<{ name: string; description?: string }>; error?: string }> {
    try {
      // 先发送 initialize 请求
      const initResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            clientInfo: {
              name: 'AionUi',
              version: '1.0.0',
            },
          },
        }),
      });

      if (!initResponse.ok) {
        return { success: false, error: `HTTP ${initResponse.status}: ${initResponse.statusText}` };
      }

      const initResult = await initResponse.json();
      if (initResult.error) {
        return { success: false, error: initResult.error.message || 'Initialize failed' };
      }

      // 发送 tools/list 请求
      const toolsResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 2,
          params: {},
        }),
      });

      if (!toolsResponse.ok) {
        return { success: true, tools: [], error: `Could not fetch tools: HTTP ${toolsResponse.status}` };
      }

      const toolsResult = await toolsResponse.json();
      if (toolsResult.error) {
        return { success: true, tools: [], error: toolsResult.error.message || 'Tools list failed' };
      }

      const tools = toolsResult.result?.tools || [];
      return {
        success: true,
        tools: tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 将MCP配置同步到所有检测到的agent
   */
  async syncMcpToAgents(mcpServers: IMcpServer[], agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>): Promise<{ success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> }> {
    // 只同步启用的MCP服务器
    const enabledServers = mcpServers.filter((server) => server.enabled);

    if (enabledServers.length === 0) {
      return { success: true, results: [] };
    }

    // 并发执行所有agent的MCP同步
    const promises = agents.map(async (agent) => {
      try {
        const result = await this.syncMcpToAgent(enabledServers, agent);
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
   * 将MCP配置同步到单个agent
   */
  private async syncMcpToAgent(mcpServers: IMcpServer[], agent: { backend: AcpBackend; name: string; cliPath?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      switch (agent.backend) {
        case 'claude':
          return await this.syncMcpToClaudeAgent(mcpServers);
        case 'qwen':
          return await this.syncMcpToQwenAgent(mcpServers);
        case 'iflow':
          return await this.syncMcpToIflowAgent(mcpServers);
        case 'gemini':
          return await this.syncMcpToGeminiAgent(mcpServers);
        default:
          return { success: false, error: `Unsupported agent backend: ${agent.backend}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 将MCP配置同步到Claude Code agent
   */
  private async syncMcpToClaudeAgent(mcpServers: IMcpServer[]): Promise<{ success: boolean; error?: string }> {
    try {
      for (const server of mcpServers) {
        if (server.transport.type === 'stdio') {
          // 使用Claude Code CLI添加MCP服务器
          // 格式: claude mcp add -s user <name> <command> -- [args...] [env_options]
          const envArgs = Object.entries(server.transport.env || {})
            .map(([key, value]) => `-e ${key}=${value}`)
            .join(' ');

          let command = `claude mcp add -s user "${server.name}" "${server.transport.command}"`;

          // 如果有参数或环境变量，使用 -- 分隔符
          if (server.transport.args?.length || Object.keys(server.transport.env || {}).length) {
            command += ' --';
            if (server.transport.args?.length) {
              // 对每个参数进行适当的引用，防止包含特殊字符的参数被误解析
              const quotedArgs = server.transport.args.map((arg) => `"${arg}"`).join(' ');
              command += ` ${quotedArgs}`;
            }
          }

          // 环境变量在 -- 之后添加
          if (envArgs) {
            command += ` ${envArgs}`;
          }

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Claude Code:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止
          }
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 将MCP配置同步到Qwen Code agent
   */
  private async syncMcpToQwenAgent(mcpServers: IMcpServer[]): Promise<{ success: boolean; error?: string }> {
    try {
      for (const server of mcpServers) {
        if (server.transport.type === 'stdio') {
          // 使用Qwen CLI添加MCP服务器
          // 格式: qwen mcp add <name> <command> [args...]
          const args = server.transport.args?.join(' ') || '';
          const envArgs = Object.entries(server.transport.env || {})
            .map(([key, value]) => `--env ${key}=${value}`)
            .join(' ');

          let command = `qwen mcp add "${server.name}" "${server.transport.command}"`;
          if (args) {
            command += ` ${args}`;
          }
          if (envArgs) {
            command += ` ${envArgs}`;
          }

          // 添加作用域参数，优先使用user作用域
          command += ' -s user';

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Qwen Code:`, error);
          }
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 将MCP配置同步到iFlow agent
   */
  private async syncMcpToIflowAgent(mcpServers: IMcpServer[]): Promise<{ success: boolean; error?: string }> {
    try {
      // 获取当前已配置的iFlow MCP服务器列表
      const existingServers = await this.getIflowMcpConfig();
      const existingServerNames = new Set(existingServers.map((s) => s.name));

      // 为每个启用的MCP服务器添加到iFlow配置中
      for (const server of mcpServers.filter((s) => s.enabled)) {
        // 跳过已经存在的服务器
        if (existingServerNames.has(server.name)) {
          continue;
        }

        try {
          let addCommand = `iflow mcp add "${server.name}"`;

          // 根据传输类型构建命令
          if (server.transport.type === 'stdio' && 'command' in server.transport) {
            addCommand += ` "${server.transport.command}"`;
            if (server.transport.args && server.transport.args.length > 0) {
              addCommand += ` ${server.transport.args.map((arg) => `"${arg}"`).join(' ')}`;
            }
            addCommand += ' --transport stdio';

            // 添加环境变量 (仅stdio支持)
            if (server.transport.env) {
              for (const [key, value] of Object.entries(server.transport.env)) {
                addCommand += ` --env ${key}="${value}"`;
              }
            }
          } else if ((server.transport.type === 'sse' || server.transport.type === 'http') && 'url' in server.transport) {
            addCommand += ` "${server.transport.url}"`;
            addCommand += ` --transport ${server.transport.type}`;
          }

          // 添加描述
          if (server.description) {
            addCommand += ` --description "${server.description}"`;
          }

          // 添加作用域参数，使用user作用域
          addCommand += ' -s user';

          // 执行添加命令
          await execAsync(addCommand, { timeout: 10000 });
        } catch (error) {
          console.warn(`Failed to add MCP server ${server.name} to iFlow:`, error);
          // 继续处理其他服务器，不要因为一个失败就停止整个过程
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从所有检测到的agent中删除MCP配置
   */
  async removeMcpFromAgents(mcpServerName: string, agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }>): Promise<{ success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> }> {
    // 并发执行所有agent的MCP删除
    const promises = agents.map(async (agent) => {
      try {
        const result = await this.removeMcpFromSingleAgent(agent, mcpServerName);
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

  /**
   * 从单个agent中删除MCP配置
   */
  private async removeMcpFromSingleAgent(agent: { backend: AcpBackend; name: string; cliPath?: string }, mcpServerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      switch (agent.backend) {
        case 'claude':
          return await this.removeMcpFromClaudeAgent(mcpServerName);
        case 'qwen':
          return await this.removeMcpFromQwenAgent(mcpServerName);
        case 'iflow':
          return await this.removeMcpFromIflowAgent(mcpServerName);
        case 'gemini':
          return await this.removeMcpFromGeminiAgent(mcpServerName);
        default:
          return { success: false, error: `Unsupported agent backend: ${agent.backend}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从Claude agent中删除MCP配置
   */
  private async removeMcpFromClaudeAgent(mcpServerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 使用Claude CLI命令删除MCP服务器
      const removeCommand = `claude mcp remove -s user "${mcpServerName}"`;

      try {
        await execAsync(removeCommand, { timeout: 5000 });
        return { success: true };
      } catch (cliError) {
        // CLI命令失败，尝试直接操作配置文件作为后备方案
        const home = homedir();
        const configPaths = [
          join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
          join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
          join(home, '.config', 'claude', 'claude_desktop_config.json'), // Linux
        ];

        for (const configPath of configPaths) {
          if (existsSync(configPath)) {
            try {
              const config = JSON.parse(readFileSync(configPath, 'utf-8'));
              if (config.mcpServers && config.mcpServers[mcpServerName]) {
                delete config.mcpServers[mcpServerName];
                writeFileSync(configPath, JSON.stringify(config, null, 2));
              }
              return { success: true };
            } catch (fileError) {
              console.warn(`Failed to update config file ${configPath}:`, fileError);
            }
          }
        }

        return { success: true }; // 如果配置文件都不存在，认为已经删除
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从Qwen agent中删除MCP配置
   */
  private async removeMcpFromQwenAgent(mcpServerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 使用Qwen CLI命令删除MCP服务器（尝试不同作用域）
      // 首先尝试project作用域，然后尝试user作用域
      try {
        const removeCommand = `qwen mcp remove "${mcpServerName}" -s project`;
        const result = await execAsync(removeCommand, { timeout: 5000 });

        // 检查输出是否表示真正的成功删除
        if (result.stdout && result.stdout.includes('removed from project settings')) {
          return { success: true };
        } else if (result.stdout && result.stdout.includes('not found in project')) {
          // 服务器不在project作用域中，尝试user作用域
          throw new Error('Server not found in project settings');
        } else {
          // 其他情况认为成功（向后兼容）
          return { success: true };
        }
      } catch (projectError) {
        // project作用域失败，尝试user作用域
        try {
          const removeCommand = `qwen mcp remove "${mcpServerName}" -s user`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // 检查输出是否表示真正的成功删除
          if (result.stdout && result.stdout.includes('removed from user settings')) {
            return { success: true };
          } else if (result.stdout && result.stdout.includes('not found in user')) {
            // 服务器不在user作用域中，尝试配置文件
            throw new Error('Server not found in user settings');
          } else {
            // 其他情况认为成功（向后兼容）
            return { success: true };
          }
        } catch (userError) {
          // CLI命令都失败，尝试直接操作配置文件作为后备
          const configPath = join(homedir(), '.qwen', 'client_config.json');

          if (!existsSync(configPath)) {
            return { success: true }; // 配置文件不存在，认为已经删除
          }

          try {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            if (config.mcpServers && config.mcpServers[mcpServerName]) {
              delete config.mcpServers[mcpServerName];
              writeFileSync(configPath, JSON.stringify(config, null, 2));
            }
            return { success: true };
          } catch (fileError) {
            console.warn(`Failed to update config file ${configPath}:`, fileError);
            return { success: true }; // 如果配置文件操作失败，也认为成功
          }
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从iFlow agent中删除MCP配置
   */
  private async removeMcpFromIflowAgent(mcpServerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 使用iFlow CLI remove命令删除MCP服务器（尝试不同作用域）
      // 首先尝试project作用域，然后尝试user作用域
      try {
        const removeCommand = `iflow mcp remove "${mcpServerName}" -s project`;
        const { stdout } = await execAsync(removeCommand, { timeout: 5000 });

        // 检查输出是否包含"not found"，如果是则继续尝试user作用域
        if (stdout && stdout.includes('not found')) {
          throw new Error('Server not found in project settings');
        }

        return { success: true };
      } catch (projectError) {
        // project作用域失败，尝试user作用域
        try {
          const removeCommand = `iflow mcp remove "${mcpServerName}" -s user`;
          await execAsync(removeCommand, { timeout: 5000 });
          return { success: true };
        } catch (userError) {
          // 如果服务器不存在，也认为是成功的
          if (userError instanceof Error && (userError.message.includes('not found') || userError.message.includes('does not exist'))) {
            return { success: true };
          }
          return { success: false, error: userError instanceof Error ? userError.message : String(userError) };
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 将MCP配置同步到Gemini agent
   */
  private async syncMcpToGeminiAgent(mcpServers: IMcpServer[]): Promise<{ success: boolean; error?: string }> {
    try {
      for (const server of mcpServers) {
        if (server.transport.type === 'stdio') {
          // 使用Gemini CLI添加MCP服务器
          // 格式: gemini mcp add -s user <name> <command> [args...] [options]
          const envArgs = Object.entries(server.transport.env || {})
            .map(([key, value]) => `-e ${key}=${value}`)
            .join(' ');

          let command = `gemini mcp add -s user "${server.name}" "${server.transport.command}"`;

          // 添加参数
          if (server.transport.args?.length) {
            const quotedArgs = server.transport.args.map((arg) => `"${arg}"`).join(' ');
            command += ` ${quotedArgs}`;
          }

          // 添加环境变量
          if (envArgs) {
            command += ` ${envArgs}`;
          }

          // 添加描述（如果有）
          if (server.description) {
            command += ` --description "${server.description}"`;
          }

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Gemini:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止
          }
        } else if (server.transport.type === 'sse' || server.transport.type === 'http') {
          // 处理 SSE/HTTP 传输类型
          let command = `gemini mcp add -s user "${server.name}" "${server.transport.url}" --transport ${server.transport.type}`;

          // 添加描述（如果有）
          if (server.description) {
            command += ` --description "${server.description}"`;
          }

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Gemini:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止
          }
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从Gemini agent中删除MCP配置
   */
  private async removeMcpFromGeminiAgent(mcpServerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 使用Gemini CLI命令删除MCP服务器（尝试不同作用域）
      // 首先尝试project作用域，然后尝试user作用域
      try {
        const removeCommand = `gemini mcp remove "${mcpServerName}" -s project`;
        const result = await execAsync(removeCommand, { timeout: 5000 });

        // 检查输出是否表示真正的成功删除
        if (result.stdout && result.stdout.includes('removed from project settings')) {
          return { success: true };
        } else if (result.stdout && result.stdout.includes('not found in project')) {
          // 服务器不在project作用域中，尝试user作用域
          throw new Error('Server not found in project settings');
        } else {
          // 其他情况认为成功（向后兼容）
          return { success: true };
        }
      } catch (projectError) {
        // project作用域失败，尝试user作用域
        try {
          const removeCommand = `gemini mcp remove "${mcpServerName}" -s user`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // 检查输出是否表示真正的成功删除
          if (result.stdout && result.stdout.includes('removed from user settings')) {
            return { success: true };
          } else if (result.stdout && result.stdout.includes('not found in user')) {
            // 服务器不在user作用域中，但这也是成功的（服务器本来就不存在）
            return { success: true };
          } else {
            // 其他情况认为成功（向后兼容）
            return { success: true };
          }
        } catch (userError) {
          // 如果服务器不存在，也认为是成功的
          if (userError instanceof Error && (userError.message.includes('not found') || userError.message.includes('does not exist'))) {
            return { success: true };
          }
          return { success: false, error: userError instanceof Error ? userError.message : String(userError) };
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const mcpService = new McpService();
