import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mcpService } from '@/common/ipcBridge';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP连接测试管理Hook
 * 处理MCP服务器的连接测试和状态更新
 */
export const useMcpConnection = (mcpServers: IMcpServer[], saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>, message: any) => {
  const { t } = useTranslation();
  const [testingServers, setTestingServers] = useState<Record<string, boolean>>({});

  // 连接测试函数
  const handleTestMcpConnection = useCallback(
    async (server: IMcpServer) => {
      setTestingServers((prev) => ({ ...prev, [server.id]: true }));

      // 更新服务器状态 - 使用统一的保存函数，避免竞态条件
      const updateServerStatus = async (status: IMcpServer['status'], additionalData?: Partial<IMcpServer>) => {
        try {
          await saveMcpServers((prevServers) => prevServers.map((s) => (s.id === server.id ? { ...s, status, updatedAt: Date.now(), ...additionalData } : s)));
        } catch (error) {
          console.error('Failed to update server status:', error);
        }
      };

      await updateServerStatus('testing');

      try {
        const response = await mcpService.testMcpConnection.invoke(server);

        if (response.success && response.data) {
          const result = response.data;

          if (result.success) {
            // 更新服务器状态为已连接，并保存获取到的工具信息
            // 连接成功时不修改 enabled 字段，让用户决定是否安装
            await updateServerStatus('connected', {
              tools: result.tools?.map((tool) => ({ name: tool.name, description: tool.description })),
              lastConnected: Date.now(),
            });
            message.success(`${server.name}: ${t('settings.mcpTestConnectionSuccess')}`);

            // 连接测试成功，不执行额外操作
          } else {
            // 更新服务器状态为错误，并禁用安装
            // 连接失败时自动设置 enabled=false，避免安装失败的服务
            await updateServerStatus('error', {
              enabled: false,
            });
            message.error(`${server.name}: ${result.error || t('settings.mcpError')}`);
          }
        } else {
          // IPC调用失败，禁用安装
          await updateServerStatus('error', {
            enabled: false,
          });
          message.error(`${server.name}: ${response.msg || t('settings.mcpError')}`);
        }
      } catch (error) {
        // 更新服务器状态为错误，禁用安装
        await updateServerStatus('error', {
          enabled: false,
        });
        message.error(`${server.name}: ${error instanceof Error ? error.message : t('settings.mcpError')}`);
      } finally {
        setTestingServers((prev) => ({ ...prev, [server.id]: false }));
      }
    },
    [saveMcpServers, message, t]
  );

  return {
    testingServers,
    handleTestMcpConnection,
  };
};
