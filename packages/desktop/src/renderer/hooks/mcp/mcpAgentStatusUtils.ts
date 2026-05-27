const INTERNAL_MCP_CONFIG_SOURCES = new Set(['aionui']);

export function isDisplayableMcpAgentSource(source: string): boolean {
  return !INTERNAL_MCP_CONFIG_SOURCES.has(source.toLowerCase());
}

export function sanitizeMcpAgentInstallStatus(status: Record<string, string[]>): Record<string, string[]> {
  const sanitized: Record<string, string[]> = {};

  for (const [serverName, agents] of Object.entries(status)) {
    const visibleAgents = agents.filter(isDisplayableMcpAgentSource);
    if (visibleAgents.length > 0) {
      sanitized[serverName] = visibleAgents;
    }
  }

  return sanitized;
}
