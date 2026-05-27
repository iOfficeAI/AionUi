import { useState, useEffect, useCallback } from 'react';
import type { IMcpServer } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { mcpService } from '@/common/adapter/ipcBridge';

/**
 * MCP服务器状态管理Hook
 * 管理MCP服务器列表的加载、保存和状态更新
 * 包含用户配置的 MCP servers 和扩展贡献的 MCP servers
 */
export const useMcpServers = () => {
  const [mcpServers, setMcpServers] = useState<IMcpServer[]>([]);
  /** Extension-contributed MCP servers (read-only, from extensions) */
  const [extensionMcpServers, setExtensionMcpServers] = useState<IMcpServer[]>([]);

  // 加载MCP服务器配置
  useEffect(() => {
    void mcpService.listServers
      .invoke()
      .then((servers) => setMcpServers(servers ?? []))
      .catch((error) => {
        console.error('[useMcpServers] Failed to load MCP servers:', error);
        setMcpServers([]);
      });

    // Load extension-contributed MCP servers
    void ipcBridge.extensions.getMcpServers
      .invoke()
      .then((extServers) => {
        if (extServers && extServers.length > 0) {
          const converted: IMcpServer[] = extServers.map((s) => ({
            id: String(s.id || ''),
            name: String(s.name || ''),
            description: s.description as string | undefined,
            enabled: s.enabled !== false,
            transport: s.transport as IMcpServer['transport'],
            status: 'connected' as const,
            created_at: (s.created_at as number) || Date.now(),
            updated_at: (s.updated_at as number) || Date.now(),
            original_json: String(s.original_json || '{}'),
            _source: 'extension' as const,
            _extensionName: s._extensionName as string | undefined,
          })) as IMcpServer[];
          setExtensionMcpServers(converted);
        }
      })
      .catch((error) => {
        console.error('[useMcpServers] Failed to load extension MCP servers:', error);
      });
  }, []);

  const reloadMcpServers = useCallback(async () => {
    const servers = await mcpService.listServers.invoke();
    setMcpServers(servers ?? []);
    return servers ?? [];
  }, []);

  // 合并后的完整列表（用户配置 + 扩展贡献）
  const allMcpServers = [...mcpServers, ...extensionMcpServers];

  return {
    mcpServers,
    allMcpServers,
    extensionMcpServers,
    setMcpServers,
    reloadMcpServers,
  };
};
