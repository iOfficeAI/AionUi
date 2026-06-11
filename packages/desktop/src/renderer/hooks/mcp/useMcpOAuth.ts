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

  const getOAuthServerUrl = useCallback((server: IMcpServer): string | null => {
    if (
      server.transport.type === 'http' ||
      server.transport.type === 'sse' ||
      server.transport.type === 'streamable_http'
    ) {
      return server.transport.url;
    }
    return null;
  }, []);

  // 检查 OAuth 状态
  const checkOAuthStatus = useCallback(
    async (server: IMcpServer) => {
      const serverUrl = getOAuthServerUrl(server);
      if (!serverUrl) {
        return;
      }

      setOAuthStatus((prev) => ({
        ...prev,
        [server.id]: {
          isAuthenticated: prev[server.id]?.isAuthenticated ?? false,
          needsLogin: prev[server.id]?.needsLogin ?? false,
          isChecking: true,
        },
      }));

      try {
        const result = await mcpService.checkOAuthStatus.invoke({ server_url: serverUrl });
        const isAuthenticated = result.authenticated === true;

        setOAuthStatus((prev) => ({
          ...prev,
          [server.id]: {
            isAuthenticated,
            needsLogin: isAuthenticated ? false : (prev[server.id]?.needsLogin ?? false),
            isChecking: false,
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
    },
    [getOAuthServerUrl]
  );

  // 执行 OAuth 登录
  const login = useCallback(
    async (server: IMcpServer): Promise<{ success: boolean; error?: string }> => {
      const serverUrl = getOAuthServerUrl(server);
      if (!serverUrl) {
        return {
          success: false,
          error: 'OAuth is only supported for URL-based MCP transports',
        };
      }

      setLoggingIn((prev) => ({ ...prev, [server.id]: true }));

      try {
        const result = await mcpService.loginMcpOAuth.invoke({ server_url: serverUrl });

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
    },
    [getOAuthServerUrl]
  );

  // 登出
  const logout = useCallback(
    async (server: IMcpServer): Promise<{ success: boolean; error?: string }> => {
      const serverUrl = getOAuthServerUrl(server);
      if (!serverUrl) {
        return {
          success: false,
          error: 'OAuth is only supported for URL-based MCP transports',
        };
      }

      try {
        await mcpService.logoutMcpOAuth.invoke({ server_url: serverUrl });

        // 登出成功，更新状态
        setOAuthStatus((prev) => ({
          ...prev,
          [server.id]: {
            isAuthenticated: false,
            needsLogin: false,
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
    [getOAuthServerUrl]
  );

  // 批量检查多个服务器的 OAuth 状态
  const checkMultipleServers = useCallback(
    async (servers: IMcpServer[]) => {
      const httpServers = servers.filter((s) => getOAuthServerUrl(s));

      await Promise.all(httpServers.map((server) => checkOAuthStatus(server)));
    },
    [checkOAuthStatus, getOAuthServerUrl]
  );

  return {
    oauthStatus,
    loggingIn,
    checkOAuthStatus,
    checkMultipleServers,
    markLoginRequired: useCallback((serverId: string) => {
      setOAuthStatus((prev) => ({
        ...prev,
        [serverId]: {
          isAuthenticated: prev[serverId]?.isAuthenticated ?? false,
          needsLogin: true,
          isChecking: false,
        },
      }));
    }, []),
    clearLoginRequired: useCallback((serverId: string) => {
      setOAuthStatus((prev) => ({
        ...prev,
        [serverId]: {
          isAuthenticated: prev[serverId]?.isAuthenticated ?? false,
          needsLogin: false,
          isChecking: false,
        },
      }));
    }, []),
    login,
    logout,
  };
};
