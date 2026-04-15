// src/process/acp/session/McpConfig.ts
import type { McpServer } from '@agentclientprotocol/sdk';

type MergeParams = {
  userServers?: McpServer[];
  presetServers?: McpServer[];
  teamServer?: McpServer;
};

// eslint-disable-next-line typescript-eslint/no-extraneous-class -- Static utility class matches project pattern
export class McpConfig {
  static merge(params: MergeParams): McpServer[] {
    const { userServers = [], presetServers = [], teamServer } = params;
    const merged = new Map<string, McpServer>();
    for (const s of presetServers) merged.set(s.name, s);
    for (const s of userServers) merged.set(s.name, s);
    const result = Array.from(merged.values());
    if (teamServer) result.push(teamServer);
    return result;
  }
}
