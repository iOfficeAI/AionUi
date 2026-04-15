// src/process/acp/session/adapters/McpConfig.ts
import type { McpServerConfig } from '../../types';

type MergeParams = {
  userServers?: McpServerConfig[];
  presetServers?: McpServerConfig[];
  teamServer?: McpServerConfig;
};

// eslint-disable-next-line typescript-eslint/no-extraneous-class -- Static utility class matches project pattern
export class McpConfig {
  static merge(params: MergeParams): McpServerConfig[] {
    const { userServers = [], presetServers = [], teamServer } = params;
    const merged = new Map<string, McpServerConfig>();
    for (const s of presetServers) merged.set(s.name, s);
    for (const s of userServers) merged.set(s.name, s);
    const result = Array.from(merged.values());
    if (teamServer) result.push(teamServer);
    return result;
  }
}
