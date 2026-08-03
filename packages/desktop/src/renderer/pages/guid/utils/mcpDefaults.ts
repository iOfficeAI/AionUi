import type { IMcpServer } from '@/common/config/storage';

/**
 * MCP servers flagged `enabled` are global defaults: they are auto-selected
 * for every new conversation so always-on servers (e.g. memory/context) work
 * without a manual step (#3119).
 *
 * The merge is a union — assistant defaults and explicit user picks are never
 * removed. Built-in servers are excluded: they are session-managed and not
 * user-toggleable in Settings → Tools.
 */
export const mergeEnabledByDefaultMcpIds = (
  selectedIds: readonly string[],
  servers: readonly IMcpServer[]
): string[] => {
  const defaultIds = servers.filter((server) => server.enabled && server.builtin !== true).map((server) => server.id);
  if (defaultIds.length === 0) {
    return [...selectedIds];
  }
  return [...new Set([...selectedIds, ...defaultIds])];
};
