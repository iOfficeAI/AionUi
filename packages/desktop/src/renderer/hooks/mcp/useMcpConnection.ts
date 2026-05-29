import type React from 'react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';
import { globalMessageQueue } from './messageQueue';

/**
 * 截断过长的错误消息，保持可读性
 * Truncate long error messages to keep them readable
 */
const truncateErrorMessage = (message: string, maxLength: number = 150): string => {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + '...';
};

/**
 * MCP连接测试管理Hook
 * 处理MCP服务器的连接测试和状态更新
 */
export const useMcpConnection = (
  setMcpServers: React.Dispatch<React.SetStateAction<IMcpServer[]>>,
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0],
  onAuthRequired?: (server: IMcpServer) => void,
  onAuthResolved?: (server: IMcpServer) => void
) => {
  const { t } = useTranslation();
  const [testingServers, setTestingServers] = useState<Record<string, boolean>>({});

  type TestOptions = {
    notify?: boolean;
  };

  // 连接测试函数
  const handleTestMcpConnection = useCallback(
    async (server: IMcpServer, options?: TestOptions) => {
      const notify = options?.notify ?? true;
      setTestingServers((prev) => ({ ...prev, [server.id]: true }));

      // 更新服务器状态 - 使用统一的保存函数，避免竞态条件
      const updateServerStatus = async (
        last_test_status: IMcpServer['last_test_status'],
        additionalData?: Partial<IMcpServer>
      ) => {
        setMcpServers((prevServers) =>
          prevServers.map((s) =>
            s.id === server.id ? { ...s, last_test_status, updated_at: Date.now(), ...additionalData } : s
          )
        );
      };

      await updateServerStatus('testing');

      try {
        const result = await mcpService.testMcpConnection.invoke(server);

        // 检查是否需要认证
        if (result.needsAuth) {
          await updateServerStatus('disconnected');
          if (notify) {
            await globalMessageQueue.add(() => {
              message.warning(`${server.name}: ${t('settings.mcpAuthRequired') || 'Authentication required'}`);
            });
          }

          // 触发认证回调
          if (onAuthRequired) {
            onAuthRequired(server);
          }
          return;
        }

        if (onAuthResolved) {
          onAuthResolved(server);
        }

        if (result.success) {
          // Record the latest successful availability test in local UI state.
          await updateServerStatus('connected', {
            tools: result.tools?.map((tool) => ({
              name: tool.name,
              description: tool.description,
              ...(tool.input_schema ? { input_schema: tool.input_schema } : {}),
              ...(tool._meta ? { _meta: tool._meta } : {}),
            })),
            last_connected: Date.now(),
          });
          if (notify) {
            await globalMessageQueue.add(() => {
              message.success(`${server.name}: ${t('settings.mcpTestConnectionSuccess')}`);
            });
          }

          // 连接测试成功，不执行额外操作
        } else {
          // Record the latest failed availability test in local UI state.
          await updateServerStatus('error');
          const errorMsg = truncateErrorMessage(result.error || t('settings.mcpError'));
          if (notify) {
            await globalMessageQueue.add(() => {
              message.error({
                content: t('settings.mcpTestConnectionFailedWithHint', {
                  name: server.name,
                  error: errorMsg,
                  defaultValue: `${server.name}: ${errorMsg}. Please review the MCP JSON configuration and test again.`,
                }),
                duration: 5000,
              });
            });
          }
        }
      } catch (error) {
        // Record the latest failed availability test in local UI state.
        await updateServerStatus('error');
        const errorMsg = truncateErrorMessage(error instanceof Error ? error.message : t('settings.mcpError'));
        if (notify) {
          await globalMessageQueue.add(() => {
            message.error({
              content: t('settings.mcpTestConnectionFailedWithHint', {
                name: server.name,
                error: errorMsg,
                defaultValue: `${server.name}: ${errorMsg}. Please review the MCP JSON configuration and test again.`,
              }),
              duration: 5000,
            });
          });
        }
      } finally {
        setTestingServers((prev) => ({ ...prev, [server.id]: false }));
      }
    },
    [setMcpServers, message, t, onAuthRequired, onAuthResolved]
  );

  const handleTestMcpConnections = useCallback(
    async (servers: IMcpServer[], options?: TestOptions & { concurrency?: number }) => {
      const concurrency = Math.max(1, options?.concurrency ?? 4);
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const server = servers[currentIndex];
          if (!server) {
            return;
          }
          await handleTestMcpConnection(server, options);
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, servers.length) }, () => worker()));
    },
    [handleTestMcpConnection]
  );

  return {
    testingServers,
    handleTestMcpConnection,
    handleTestMcpConnections,
  };
};
