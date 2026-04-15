// tests/unit/process/acp/session/AuthNegotiator.test.ts

import { describe, it, expect, vi } from 'vitest';
import { AuthNegotiator } from '@process/acp/session/AuthNegotiator';

describe('AuthNegotiator', () => {
  it('buildAuthMethods converts env_var RawAuthMethod', () => {
    const neg = new AuthNegotiator('claude');
    const methods = neg.buildAuthMethods([
      {
        id: 'api_key',
        type: 'env_var',
        name: 'API Key',
        fields: [{ key: 'ANTHROPIC_API_KEY', label: 'API Key', secret: true }],
      },
    ]);
    expect(methods).toEqual([
      {
        type: 'env_var',
        id: 'api_key',
        name: 'API Key',
        fields: [{ key: 'ANTHROPIC_API_KEY', label: 'API Key', secret: true }],
      },
    ]);
  });

  it('buildAuthMethods converts terminal RawAuthMethod', () => {
    const neg = new AuthNegotiator('claude');
    const methods = neg.buildAuthMethods([
      {
        id: 'oauth',
        type: 'terminal',
        name: 'OAuth Login',
        command: 'claude',
        args: ['auth', 'login'],
      },
    ]);
    expect(methods[0].type).toBe('terminal');
    if (methods[0].type === 'terminal') {
      expect(methods[0].command).toBe('claude');
    }
  });

  it('mergeCredentials stores and retrieves credentials', () => {
    const neg = new AuthNegotiator('claude');
    neg.mergeCredentials({ ANTHROPIC_API_KEY: 'sk-123' });
    expect(neg.hasCredentials).toBe(true);
  });

  it('hasCredentials is false initially', () => {
    const neg = new AuthNegotiator('claude');
    expect(neg.hasCredentials).toBe(false);
  });

  it('buildAuthRequiredData returns correct structure (INV-S-15)', () => {
    const neg = new AuthNegotiator('claude');
    const data = neg.buildAuthRequiredData([
      { id: 'key', type: 'env_var', name: 'Key', fields: [{ key: 'K', label: 'K', secret: true }] },
    ]);
    expect(data.agentBackend).toBe('claude');
    expect(data.methods).toHaveLength(1);
  });
});
