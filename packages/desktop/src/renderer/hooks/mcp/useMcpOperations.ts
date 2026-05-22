import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mcpService } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
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

// 定义MCP操作结果类型
interface McpOperationResult {
  agent: string;
  success: boolean;
  error?: string;
}

interface McpOperationResponse {
  success: boolean;
  results: McpOperationResult[];
}

/**
 * MCP操作管理Hook
 * 处理MCP服务器与agents之间的同步和移除操作
 */
export const useMcpOperations = (
  mcpServers: IMcpServer[],
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0]
) => {
  const { t } = useTranslation();

  // 处理MCP配置同步到agents的结果
  const handleMcpOperationResult = useCallback(
    async (
      response: McpOperationResponse,
      operation: 'sync' | 'remove',
      successMessage?: string,
      skipRecheck = false
    ) => {
      if (response.success) {
        const { results } = response;
        const failedAgents = results.filter((r: McpOperationResult) => !r.success);

        // 立即显示操作开始的消息，然后触发状态更新
        if (failedAgents.length > 0) {
          const failedNames = failedAgents
            .map((r: McpOperationResult) => `${r.agent}: ${truncateErrorMessage(r.error || '')}`)
            .join(', ');
          const truncatedErrors = truncateErrorMessage(failedNames, 200);
          const partialFailedKey = operation === 'sync' ? 'mcpSyncPartialFailed' : 'mcpRemovePartialFailed';
          await globalMessageQueue.add(() => {
            message.warning({
              content: t(`settings.${partialFailedKey}`, { errors: truncatedErrors }),
              duration: 6000,
            });
          });
        } else {
          if (successMessage) {
            await globalMessageQueue.add(() => {
              message.success(successMessage);
            });
          }
          // 不再显示"开始操作"消息，因为已经在操作开始时显示了
        }

        // 然后更新UI状态
        if (!skipRecheck) {
          const latestServers = configService.get('mcp.config');
          if (latestServers) {
            // Can trigger status check here, but needs callback from the caller
          }
        }
      } else {
        const failedKey = operation === 'sync' ? 'mcpSyncFailed' : 'mcpRemoveFailed';
        const errorMsg = truncateErrorMessage(t('settings.unknownError'));
        await globalMessageQueue.add(() => {
          message.error({ content: t(`settings.${failedKey}`, { error: errorMsg }), duration: 6000 });
        });
      }
    },
    [message, t]
  );

  // 从agents中删除MCP配置
  const removeMcpFromAgents = useCallback(
    async (server_name: string, successMessage?: string, _transport_type?: string) => {
      await globalMessageQueue.add(() => {
        message.info(t('settings.mcpRemoveStarted'));
      });

      const removeResponse = await mcpService.removeMcpFromAgents.invoke({
        server_names: [server_name],
      });
      await handleMcpOperationResult(removeResponse, 'remove', successMessage, true);
    },
    [message, t, handleMcpOperationResult]
  );

  // 向agents同步MCP配置
  const syncMcpToAgents = useCallback(
    async (server: IMcpServer, skipRecheck = false) => {
      await globalMessageQueue.add(() => {
        message.info(t('settings.mcpSyncStarted'));
      });

      const syncResponse = await mcpService.syncMcpToAgents.invoke({
        servers: [server.id],
      });

      await handleMcpOperationResult(syncResponse, 'sync', undefined, skipRecheck);
    },
    [message, t, handleMcpOperationResult]
  );

  return {
    syncMcpToAgents,
    removeMcpFromAgents,
    handleMcpOperationResult,
  };
};
