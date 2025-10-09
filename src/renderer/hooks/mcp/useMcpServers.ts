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
  const saveMcpServers = useCallback(async (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => {
    let updatedServers: IMcpServer[];

    // 支持函数式更新
    if (typeof serversOrUpdater === 'function') {
      setMcpServers((prev) => {
        updatedServers = serversOrUpdater(prev);
        return updatedServers;
      });
    } else {
      updatedServers = serversOrUpdater;
      setMcpServers(updatedServers);
    }

    // 然后保存到存储
    try {
      await ConfigStorage.set('mcp.config', updatedServers);
    } catch (error) {
      console.error('Failed to save MCP servers:', error);
      // Handle storage error silently
    }
  }, []);

  return {
    mcpServers,
    setMcpServers,
    saveMcpServers,
  };
};
