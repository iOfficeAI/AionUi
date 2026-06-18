const SUPPORTED_NEW_CONVERSATION_AGENT_TYPES = new Set(['acp', 'aionrs']);
const DEPRECATED_RUNTIME_AGENT_TYPES = new Set(['openclaw-gateway', 'nanobot', 'remote', 'gemini']);

export function isSupportedNewConversationAgent(agent: { agent_type: string }): boolean {
  return SUPPORTED_NEW_CONVERSATION_AGENT_TYPES.has(agent.agent_type);
}

export function isDeprecatedRuntimeAgentType(agentType?: string | null): boolean {
  return Boolean(agentType && DEPRECATED_RUNTIME_AGENT_TYPES.has(agentType));
}

export function resolveSupportedConversationType(backend?: string | null): 'acp' | 'aionrs' {
  return backend === 'aionrs' ? 'aionrs' : 'acp';
}

export function normalizeSupportedAgentSelection(
  agentType?: string,
  backend?: string
): { agent_type: 'acp' | 'aionrs'; backend?: string } | undefined {
  if (agentType === 'aionrs' || backend === 'aionrs') {
    return { agent_type: 'aionrs' };
  }

  if (agentType === 'acp') {
    return { agent_type: 'acp', backend };
  }

  if (agentType && !isDeprecatedRuntimeAgentType(agentType)) {
    return { agent_type: resolveSupportedConversationType(agentType), backend: agentType };
  }

  if (backend && !isDeprecatedRuntimeAgentType(backend)) {
    return { agent_type: resolveSupportedConversationType(backend), backend };
  }

  return undefined;
}
