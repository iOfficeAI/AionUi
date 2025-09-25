import { useState, useEffect, useCallback } from 'react';
import { ConfigStorage } from '@/common/storage';
import type { IMcpServer } from '@/common/storage';

/**
 * MCP服务器状态管理Hook
 * 管理MCP服务器列表的加载、保存和状态更新
 */
export const useMcpServers = () => {
  const [mcpServers, setMcpServers] = useState<IMcpServer[]>([]);

  // 加载MCP服务器配置
  useEffect(() => {
    void ConfigStorage.get('mcp.config')
      .then((data) => {
        if (data) {
          setMcpServers(data);
        }
      })
      .catch(() => {
        // Handle loading error silently
      });
  }, []);

  // 保存MCP服务器配置
  const saveMcpServers = useCallback((servers: IMcpServer[]) => {
    void ConfigStorage.set('mcp.config', servers).catch(() => {
      // Handle storage error silently
    });
    setMcpServers(servers);
  }, []);

  return {
    mcpServers,
    setMcpServers,
    saveMcpServers,
  };
};
