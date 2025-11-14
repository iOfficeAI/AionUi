/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPOAuthProvider, OAUTH_DISPLAY_MESSAGE_EVENT } from '@office-ai/aioncli-core/dist/src/mcp/oauth-provider.js';
import { MCPOAuthTokenStorage } from '@office-ai/aioncli-core/dist/src/mcp/oauth-token-storage.js';
import type { MCPOAuthConfig } from '@office-ai/aioncli-core/dist/src/mcp/oauth-provider.js';
import { EventEmitter } from 'node:events';
import type { IMcpServer } from '../../../common/storage';

export interface OAuthStatus {
  isAuthenticated: boolean;
  needsLogin: boolean;
  error?: string;
}

/**
 * MCP OAuth 服务
 *
 * 负责管理 MCP 服务器的 OAuth 认证流程
 * 使用 @office-ai/aioncli-core 的 OAuth 功能
 */
export class McpOAuthService {
  private oauthProvider: MCPOAuthProvider;
  private tokenStorage: MCPOAuthTokenStorage;
  private eventEmitter: EventEmitter;

  constructor() {
    this.tokenStorage = new MCPOAuthTokenStorage();
    this.oauthProvider = new MCPOAuthProvider(this.tokenStorage);
    this.eventEmitter = new EventEmitter();

    // 监听 OAuth 显示消息事件
    this.eventEmitter.on(OAUTH_DISPLAY_MESSAGE_EVENT, (message: string) => {
      console.log('[McpOAuthService] OAuth Message:', message);
      // 可以通过 WebSocket 发送到前端
    });
  }

  /**
   * 检查 MCP 服务器是否需要 OAuth 认证
   * 通过尝试连接并检查 WWW-Authenticate 头来判断
   */
  async checkOAuthStatus(server: IMcpServer): Promise<OAuthStatus> {
    try {
      // 只有 HTTP/SSE 传输类型才支持 OAuth
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          isAuthenticated: true,
          needsLogin: false,
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          isAuthenticated: false,
          needsLogin: false,
          error: 'No URL provided',
        };
      }

      // 尝试访问 MCP 服务器
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      // 检查是否返回 401 Unauthorized
      if (response.status === 401) {
        const wwwAuthenticate = response.headers.get('WWW-Authenticate');

        if (wwwAuthenticate) {
          // 服务器要求 OAuth 认证
          // 检查是否已有存储的 token
          const credentials = await this.tokenStorage.getCredentials(server.name);

          if (credentials && credentials.token) {
            // 有 token，但可能已过期
            const isExpired = this.tokenStorage.isTokenExpired(credentials.token);

            return {
              isAuthenticated: !isExpired,
              needsLogin: isExpired,
              error: isExpired ? 'Token expired' : undefined,
            };
          }

          // 没有 token，需要登录
          return {
            isAuthenticated: false,
            needsLogin: true,
          };
        }
      }

      // 连接成功或不需要认证
      return {
        isAuthenticated: true,
        needsLogin: false,
      };
    } catch (error) {
      console.error('[McpOAuthService] Error checking OAuth status:', error);
      return {
        isAuthenticated: false,
        needsLogin: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行 OAuth 登录流程
   */
  async login(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // 只有 HTTP/SSE 传输类型才支持 OAuth
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          success: false,
          error: 'OAuth only supported for HTTP/SSE transport',
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          success: false,
          error: 'No URL provided',
        };
      }

      // 如果没有提供 OAuth 配置，尝试从服务器发现
      let config = oauthConfig;
      if (!config) {
        // 使用默认配置，OAuth provider 会尝试自动发现
        config = {
          enabled: true,
        };
      }

      // 执行 OAuth 认证流程
      await this.oauthProvider.authenticate(server.name, config, url, this.eventEmitter);

      console.log(`[McpOAuthService] OAuth login successful for ${server.name}`);
      return { success: true };
    } catch (error) {
      console.error('[McpOAuthService] OAuth login failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取有效的访问 token
   */
  async getValidToken(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<string | null> {
    try {
      const config = oauthConfig || { enabled: true };
      return await this.oauthProvider.getValidToken(server.name, config);
    } catch (error) {
      console.error('[McpOAuthService] Failed to get valid token:', error);
      return null;
    }
  }

  /**
   * 登出（删除存储的 token）
   */
  async logout(serverName: string): Promise<void> {
    try {
      await this.tokenStorage.deleteCredentials(serverName);
      console.log(`[McpOAuthService] Logged out from ${serverName}`);
    } catch (error) {
      console.error('[McpOAuthService] Failed to logout:', error);
      throw error;
    }
  }

  /**
   * 获取所有已认证的服务器列表
   */
  async getAuthenticatedServers(): Promise<string[]> {
    try {
      return await this.tokenStorage.listServers();
    } catch (error) {
      console.error('[McpOAuthService] Failed to list servers:', error);
      return [];
    }
  }

  /**
   * 获取事件发射器，用于监听 OAuth 消息
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

// 单例导出
export const mcpOAuthService = new McpOAuthService();
