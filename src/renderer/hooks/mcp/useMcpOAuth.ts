import { useState, useCallback } from 'react';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';

export interface McpOAuthStatus {
  isAuthenticated: boolean;
  needsLogin: boolean;
  isChecking: boolean;
  error?: string;
}

/**
 * MCP OAuth 管理 Hook
 * 处理 MCP 服务器的 OAuth 认证状态检查和登录流程
 */
export const useMcpOAuth = () => {
  const [oauthStatus, setOAuthStatus] = useState<Record<string, McpOAuthStatus>>({});
  const [loggingIn, setLoggingIn] = useState<Record<string, boolean>>({});

  // 检查 OAuth 状态
  const checkOAuthStatus = useCallback(async (server: IMcpServer) => {
    // 只检查 HTTP/SSE 类型的服务器
    if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
      return;
    }

    setOAuthStatus((prev) => ({
      ...prev,
      [server.id]: {
        isAuthenticated: false,
        needsLogin: false,
        isChecking: true,
      },
    }));

    try {
      const result = await mcpService.checkOAuthStatus.invoke(server);

      setOAuthStatus((prev) => ({
        ...prev,
        [server.id]: {
          isAuthenticated: result.isAuthenticated,
          needsLogin: result.needsLogin,
          isChecking: false,
          error: result.error,
        },
      }));
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
      setOAuthStatus((prev) => ({
        ...prev,
        [server.id]: {
          isAuthenticated: false,
          needsLogin: false,
          isChecking: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    }
  }, []);

  // 执行 OAuth 登录
  const login = useCallback(async (server: IMcpServer): Promise<{ success: boolean; error?: string }> => {
    setLoggingIn((prev) => ({ ...prev, [server.id]: true }));

    try {
      const result = await mcpService.loginMcpOAuth.invoke({
        server,
        config: undefined, // 使用自动发现
      });

      if (result.success) {
        // 登录成功，更新状态
        setOAuthStatus((prev) => ({
          ...prev,
          [server.id]: {
            isAuthenticated: true,
            needsLogin: false,
            isChecking: false,
          },
        }));
        return { success: true };
      } else {
        return {
          success: false,
          error: result.error || 'Login failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      setLoggingIn((prev) => ({ ...prev, [server.id]: false }));
    }
  }, []);

  // 登出
  const logout = useCallback(
    async (serverName: string, serverId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await mcpService.logoutMcpOAuth.invoke(serverName);

        // 登出成功，更新状态
        setOAuthStatus((prev) => ({
          ...prev,
          [serverId]: {
            isAuthenticated: false,
            needsLogin: true,
            isChecking: false,
          },
        }));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    []
  );

  // 批量检查多个服务器的 OAuth 状态
  const checkMultipleServers = useCallback(
    async (servers: IMcpServer[]) => {
      const httpServers = servers.filter((s) => s.transport.type === 'http' || s.transport.type === 'sse');

      await Promise.all(httpServers.map((server) => checkOAuthStatus(server)));
    },
    [checkOAuthStatus]
  );

  return {
    oauthStatus,
    loggingIn,
    checkOAuthStatus,
    checkMultipleServers,
    login,
    logout,
  };
};
