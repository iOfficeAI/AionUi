import { describe, expect, it } from 'vitest';

import { isSupportedNewConversationAgent } from '@/renderer/pages/guid/hooks/useGuidAgentSelection';

describe('Guid agent support policy', () => {
  it('allows only ACP and Aion CLI for new conversations', () => {
    expect(isSupportedNewConversationAgent({ agent_type: 'acp' })).toBe(true);
    expect(isSupportedNewConversationAgent({ agent_type: 'aionrs' })).toBe(true);
    expect(isSupportedNewConversationAgent({ agent_type: 'openclaw-gateway' })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'nanobot' })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'remote' })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'gemini' })).toBe(false);
  });
});
