import { useState, useEffect, useRef, useCallback } from 'react';
import { ConfigStorage } from '@/common/storage';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP Agent安装状态管理Hook
 * 管理MCP服务器在各个agent中的安装状态检查和缓存
 */
export const useMcpAgentStatus = () => {
  const [agentInstallStatus, setAgentInstallStatus] = useState<Record<string, string[]>>({});
  const [loadingServers, setLoadingServers] = useState<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckTimeRef = useRef<number>(0);
  const agentConfigsCacheRef = useRef<Array<{ source: string; servers: Array<{ name: string }> }> | null>(null);

  // 加载已保存的agent安装状态
  useEffect(() => {
    void ConfigStorage.get('mcp.agentInstallStatus')
      .then((status) => {
        if (status && typeof status === 'object') {
          setAgentInstallStatus(status as Record<string, string[]>);
        }
      })
      .catch(() => {
        // Handle loading error silently
      });
  }, []);

  // 保存agent安装状态到存储
  const saveAgentInstallStatus = useCallback((status: Record<string, string[]>) => {
    void ConfigStorage.set('mcp.agentInstallStatus', status).catch(() => {
      // Handle storage error silently
    });
    setAgentInstallStatus(status);
  }, []);

  // 处理agent配置数据的通用函数
  const processAgentConfigs = useCallback(
    (servers: IMcpServer[], agentConfigs: Array<{ source: string; servers: Array<{ name: string }> }>, targetServerName?: string) => {
      // 基于当前状态创建新状态，避免重置其他服务器的状态
      const installStatus: Record<string, string[]> = { ...agentInstallStatus };

      // 预构建服务器名称到服务器对象的映射，避免重复find操作
      const serverMap = new Map<string, IMcpServer>();
      const serversToProcess = targetServerName ? servers.filter((s) => s.name === targetServerName) : servers;

      serversToProcess.forEach((server) => {
        if (server.enabled) {
          serverMap.set(server.name, server);
          installStatus[server.name] = [];
        } else {
          // 如果目标服务器被禁用，也要从状态中移除
          delete installStatus[server.name];
        }
      });

      // 检查每个agent的MCP配置，只检查启用的服务器
      agentConfigs.forEach((agentConfig) => {
        agentConfig.servers.forEach((agentServer) => {
          // 使用Map查找，O(1)时间复杂度
          const localServer = serverMap.get(agentServer.name);
          // 只有当本地服务器存在且启用时，才显示安装状态
          if (localServer && installStatus[agentServer.name] !== undefined) {
            installStatus[agentServer.name].push(agentConfig.source);
          }
        });
      });

      // 在保存检测结果前，过滤掉已被禁用的服务器，防止覆盖用户的删除操作
      const currentEnabledServers = servers.filter((s) => s.enabled).map((s) => s.name);
      const filteredInstallStatus: Record<string, string[]> = {};

      for (const [serverName, agents] of Object.entries(installStatus)) {
        if (currentEnabledServers.includes(serverName)) {
          filteredInstallStatus[serverName] = agents;
        }
      }

      saveAgentInstallStatus(filteredInstallStatus);
    },
    [agentInstallStatus, saveAgentInstallStatus]
  );

  // 检查每个MCP服务器在哪些agent中安装了
  const checkAgentInstallStatus = useCallback(
    async (servers: IMcpServer[], forceRefresh = false, targetServerName?: string) => {
      // 缓存检查：如果5秒内已检查过且有缓存，直接使用缓存（除非强制刷新）
      const now = Date.now();
      const CACHE_DURATION = 5000; // 5秒缓存

      if (!forceRefresh && agentConfigsCacheRef.current && now - lastCheckTimeRef.current < CACHE_DURATION) {
        // 使用缓存数据重新计算状态
        processAgentConfigs(servers, agentConfigsCacheRef.current, targetServerName);
        return;
      }

      // 设置加载状态 - 如果指定了目标服务器则只标记该服务器，否则标记所有启用的服务器
      const serversToLoad = targetServerName ? [targetServerName] : servers.filter((s) => s.enabled).map((s) => s.name);
      setLoadingServers((prev) => {
        const newSet = new Set(prev);
        serversToLoad.forEach((name) => newSet.add(name));
        return newSet;
      });

      try {
        // 先获取agents信息，然后基于结果获取MCP配置（无法真正并行，因为第二个依赖第一个的结果）
        const agentsResponse = await acpConversation.getAvailableAgents.invoke();

        if (!agentsResponse.success || !agentsResponse.data) {
          // 如果没有检测到agent，只在初次加载时清空状态
          if (Object.keys(agentInstallStatus).length === 0) {
            saveAgentInstallStatus({});
          }
          return;
        }

        const mcpConfigsResponse = await mcpService.getAgentMcpConfigs.invoke(agentsResponse.data);

        if (!mcpConfigsResponse.success || !mcpConfigsResponse.data) {
          // 如果MCP配置获取失败，保持当前状态，避免闪烁
          return;
        }

        // 更新缓存
        agentConfigsCacheRef.current = mcpConfigsResponse.data;
        lastCheckTimeRef.current = now;

        // 处理配置数据
        processAgentConfigs(servers, mcpConfigsResponse.data, targetServerName);
      } catch (error) {
        // 出错时保持当前状态，避免闪烁
      } finally {
        // 清除加载状态
        setLoadingServers((prev) => {
          const newSet = new Set(prev);
          serversToLoad.forEach((name) => newSet.delete(name));
          return newSet;
        });
      }
    },
    [agentInstallStatus, processAgentConfigs, saveAgentInstallStatus]
  );

  // 防抖版本的状态检查，避免频繁调用
  const debouncedCheckAgentInstallStatus = useCallback(
    (servers: IMcpServer[], forceRefresh = false, targetServerName?: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        checkAgentInstallStatus(servers, forceRefresh, targetServerName).catch(() => {
          // Silently handle errors
        });
      }, 300); // 300ms 防抖
    },
    [checkAgentInstallStatus]
  );

  // 仅检查单个服务器的安装状态（不执行连接测试等其他操作）
  const checkSingleServerInstallStatus = useCallback(async (serverName: string) => {
    // 设置加载状态
    setLoadingServers((prev) => new Set(prev).add(serverName));

    try {
      // 获取可用的agents
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (!agentsResponse.success || !agentsResponse.data) {
        return;
      }

      // 获取所有agents的MCP配置
      const mcpConfigsResponse = await mcpService.getAgentMcpConfigs.invoke(agentsResponse.data);
      if (!mcpConfigsResponse.success || !mcpConfigsResponse.data) {
        return;
      }

      // 只检查指定服务器的安装状态
      const installedAgents: string[] = [];
      mcpConfigsResponse.data.forEach((agentConfig) => {
        const hasServer = agentConfig.servers.some((server) => server.name === serverName);
        if (hasServer) {
          installedAgents.push(agentConfig.source);
        }
      });

      // 更新该服务器的安装状态
      setAgentInstallStatus((prev) => {
        const updated = { ...prev };
        if (installedAgents.length > 0) {
          updated[serverName] = installedAgents;
        } else {
          delete updated[serverName];
        }

        // 同时更新本地存储
        void ConfigStorage.set('mcp.agentInstallStatus', updated).catch(() => {
          // Handle storage error silently
        });

        return updated;
      });
    } catch (error) {
      // 检查失败时静默处理
    } finally {
      // 清除加载状态
      setLoadingServers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverName);
        return newSet;
      });
    }
  }, []);

  // 检查特定服务器是否正在加载
  const isServerLoading = useCallback(
    (serverName: string) => {
      return loadingServers.has(serverName);
    },
    [loadingServers]
  );

  return {
    agentInstallStatus,
    setAgentInstallStatus,
    loadingServers,
    isServerLoading,
    checkAgentInstallStatus,
    debouncedCheckAgentInstallStatus,
    checkSingleServerInstallStatus,
  };
};
