import { describe, expect, it } from 'vitest';

import {
  isDeprecatedRuntimeAgentType,
  resolveSupportedConversationType,
} from '@/renderer/utils/model/agentTypeSupportPolicy';

describe('Guid agent support policy', () => {
  it('marks retired top-level runtime agent types as deprecated', () => {
    expect(isDeprecatedRuntimeAgentType('acp')).toBe(false);
    expect(isDeprecatedRuntimeAgentType('aionrs')).toBe(false);
    expect(isDeprecatedRuntimeAgentType('openclaw-gateway')).toBe(true);
    expect(isDeprecatedRuntimeAgentType('nanobot')).toBe(true);
    expect(isDeprecatedRuntimeAgentType('remote')).toBe(true);
    expect(isDeprecatedRuntimeAgentType('gemini')).toBe(true);
  });

  it('resolves supported top-level conversation type from backend labels', () => {
    expect(resolveSupportedConversationType('aionrs')).toBe('aionrs');
    expect(resolveSupportedConversationType('claude')).toBe('acp');
    expect(resolveSupportedConversationType('gemini')).toBe('acp');
    expect(resolveSupportedConversationType('openclaw-gateway')).toBe('acp');
    expect(resolveSupportedConversationType('openclaw')).toBe('acp');
  });
});
