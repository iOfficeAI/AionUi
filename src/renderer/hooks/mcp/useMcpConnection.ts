import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mcpService } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP连接测试管理Hook
 * 处理MCP服务器的连接测试和状态更新
 */
export const useMcpConnection = (mcpServers: IMcpServer[], setMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => void, message: any) => {
  const { t } = useTranslation();
  const [testingServers, setTestingServers] = useState<Record<string, boolean>>({});

  // 连接测试函数
  const handleTestMcpConnection = useCallback(
    async (server: IMcpServer) => {
      setTestingServers((prev) => ({ ...prev, [server.id]: true }));

      // 更新服务器状态 - 使用函数式更新，避免闭包问题
      const updateServerStatus = (status: IMcpServer['status'], additionalData?: Partial<IMcpServer>) => {
        // 使用函数式更新，确保基于最新状态
        setMcpServers((prevServers) => {
          const updatedServers = prevServers.map((s) => (s.id === server.id ? { ...s, status, updatedAt: Date.now(), ...additionalData } : s));

          // 保存到存储
          void ConfigStorage.set('mcp.config', updatedServers).catch(() => {
            // Handle storage error silently
          });

          return updatedServers;
        });
      };

      updateServerStatus('testing');

      try {
        const response = await mcpService.testMcpConnection.invoke(server);

        if (response.success && response.data) {
          const result = response.data;

          if (result.success) {
            // 更新服务器状态为已连接，启用开关，并保存获取到的工具信息
            updateServerStatus('connected', {
              enabled: true,
              tools: result.tools?.map((tool) => ({ name: tool.name, description: tool.description })),
              lastConnected: Date.now(),
            });
            message.success(`${server.name}: ${t('settings.mcpTestConnectionSuccess')}`);

            // 连接测试成功，不执行额外操作
          } else {
            // 更新服务器状态为错误，并禁用开关
            updateServerStatus('error', { enabled: false });
            message.error(`${server.name}: ${result.error || t('settings.mcpError')}`);
          }
        } else {
          // IPC调用失败，禁用开关
          updateServerStatus('error', { enabled: false });
          message.error(`${server.name}: ${response.msg || t('settings.mcpError')}`);
        }
      } catch (error) {
        // 更新服务器状态为错误，并禁用开关
        updateServerStatus('error', { enabled: false });
        message.error(`${server.name}: ${error instanceof Error ? error.message : t('settings.mcpError')}`);
      } finally {
        setTestingServers((prev) => ({ ...prev, [server.id]: false }));
      }
    },
    [setMcpServers, message, t]
  );

  return {
    testingServers,
    handleTestMcpConnection,
  };
};
