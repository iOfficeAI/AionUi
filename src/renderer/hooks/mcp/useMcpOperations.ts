import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import type { IMcpServer } from '@/common/storage';

// 定义MCP操作结果类型
interface McpOperationResult {
  agent: string;
  success: boolean;
  error?: string;
}

interface McpOperationResponse {
  success: boolean;
  data?: {
    results: McpOperationResult[];
  };
  msg?: string;
}

/**
 * MCP操作管理Hook
 * 处理MCP服务器与agents之间的同步和移除操作
 */
export const useMcpOperations = (mcpServers: IMcpServer[], message: any) => {
  const { t } = useTranslation();

  // 处理MCP配置同步到agents的结果
  const handleMcpOperationResult = useCallback(
    (response: McpOperationResponse, operation: 'sync' | 'remove', successMessage?: string, skipRecheck = false) => {
      if (response.success && response.data) {
        const { results } = response.data;
        const failedAgents = results.filter((r: McpOperationResult) => !r.success);

        // 立即显示操作开始的消息，然后触发状态更新
        if (failedAgents.length > 0) {
          const failedNames = failedAgents.map((r: McpOperationResult) => `${r.agent}: ${r.error}`).join(', ');
          const partialFailedKey = operation === 'sync' ? 'mcpSyncPartialFailed' : 'mcpRemovePartialFailed';
          message.warning(t(`settings.${partialFailedKey}`, { errors: failedNames }));
        } else {
          if (successMessage) {
            message.success(successMessage);
          }
          // 不再显示"开始操作"消息，因为已经在操作开始时显示了
        }

        // 然后更新UI状态
        if (!skipRecheck) {
          void ConfigStorage.get('mcp.config')
            .then((latestServers) => {
              if (latestServers) {
                // 这里可以触发状态检查，但需要在使用的地方提供回调
              }
            })
            .catch(() => {
              // Handle loading error silently
            });
        }
      } else {
        const failedKey = operation === 'sync' ? 'mcpSyncFailed' : 'mcpRemoveFailed';
        message.error(t(`settings.${failedKey}`, { error: response.msg || t('settings.unknownError') }));
      }
    },
    [message, t]
  );

  // 从agents中删除MCP配置
  const removeMcpFromAgents = useCallback(
    async (serverName: string, successMessage?: string) => {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (agentsResponse.success && agentsResponse.data) {
        // 立即显示开始移除的消息
        message.info(t('settings.mcpRemoveStarted', { count: agentsResponse.data.length }));

        const removeResponse = await mcpService.removeMcpFromAgents.invoke({
          mcpServerName: serverName,
          agents: agentsResponse.data,
        });
        handleMcpOperationResult(removeResponse, 'remove', successMessage, true); // 跳过重新检测
      }
    },
    [message, t, handleMcpOperationResult]
  );

  // 向agents同步MCP配置
  const syncMcpToAgents = useCallback(
    async (server: IMcpServer, skipRecheck = false) => {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (agentsResponse.success && agentsResponse.data) {
        // 立即显示开始同步的消息
        message.info(t('settings.mcpSyncStarted', { count: agentsResponse.data.length }));

        const syncResponse = await mcpService.syncMcpToAgents.invoke({
          mcpServers: [server],
          agents: agentsResponse.data,
        });
        handleMcpOperationResult(syncResponse, 'sync', undefined, skipRecheck);
      }
    },
    [message, t, handleMcpOperationResult]
  );

  return {
    syncMcpToAgents,
    removeMcpFromAgents,
    handleMcpOperationResult,
  };
};
