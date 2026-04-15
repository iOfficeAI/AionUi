// tests/unit/process/acp/session/AuthNegotiator.test.ts

import { describe, it, expect, vi } from 'vitest';
import { AuthNegotiator } from '@process/acp/session/AuthNegotiator';
import type { AuthMethod } from '@agentclientprotocol/sdk';

// Helper: create SDK AuthMethod shapes
function envVarMethod(overrides?: Partial<AuthMethod & { type: 'env_var' }>): AuthMethod {
  return {
    id: 'api_key',
    type: 'env_var',
    name: 'API Key',
    vars: [{ name: 'ANTHROPIC_API_KEY', label: 'API Key', secret: true }],
    ...overrides,
  } as AuthMethod;
}

function terminalMethod(): AuthMethod {
  return {
    id: 'oauth',
    type: 'terminal',
    name: 'OAuth Login',
    args: ['auth', 'login'],
  } as AuthMethod;
}

function agentMethod(): AuthMethod {
  return {
    id: 'agent_auth',
    name: 'Agent Auth',
  } as AuthMethod;
}

describe('AuthNegotiator', () => {
  // ─── buildAuthRequiredData ─────────────────────────────────

  it('buildAuthRequiredData passes SDK AuthMethods through directly', () => {
    const neg = new AuthNegotiator('claude');
    const methods = [envVarMethod()];
    const data = neg.buildAuthRequiredData(methods);
    expect(data.agentBackend).toBe('claude');
    expect(data.methods).toHaveLength(1);
    expect(data.methods[0]).toBe(methods[0]);
  });

  it('buildAuthRequiredData includes terminal methods', () => {
    const neg = new AuthNegotiator('claude');
    const data = neg.buildAuthRequiredData([terminalMethod()]);
    expect(data.methods).toHaveLength(1);
    expect(data.methods[0].id).toBe('oauth');
  });

  it('buildAuthRequiredData returns correct structure (INV-S-15)', () => {
    const neg = new AuthNegotiator('claude');
    const data = neg.buildAuthRequiredData([envVarMethod()]);
    expect(data.agentBackend).toBe('claude');
    expect(data.methods).toHaveLength(1);
  });

  // ─── Credential Management ──────────────────────────────────

  it('mergeCredentials stores and retrieves credentials', () => {
    const neg = new AuthNegotiator('claude');
    neg.mergeCredentials({ ANTHROPIC_API_KEY: 'sk-123' });
    expect(neg.hasCredentials).toBe(true);
  });

  it('hasCredentials is false initially', () => {
    const neg = new AuthNegotiator('claude');
    expect(neg.hasCredentials).toBe(false);
  });

  // ─── authenticate (method selection + protocol call) ────────

  it('authenticate calls protocol.authenticate with selected methodId when credentials match', async () => {
    const neg = new AuthNegotiator('codex');
    neg.mergeCredentials({ OPENAI_API_KEY: 'sk-test' });

    const protocol = { authenticate: vi.fn().mockResolvedValue(undefined) };
    await neg.authenticate(protocol, [
      {
        id: 'openai_key',
        type: 'env_var',
        name: 'OpenAI Key',
        vars: [{ name: 'OPENAI_API_KEY', label: 'API Key', secret: true }],
      } as AuthMethod,
    ]);

    expect(protocol.authenticate).toHaveBeenCalledWith('openai_key');
  });

  it('authenticate skips when no credentials match any method', async () => {
    const neg = new AuthNegotiator('codex');

    const protocol = { authenticate: vi.fn() };
    await neg.authenticate(protocol, [
      {
        id: 'openai_key',
        type: 'env_var',
        name: 'OpenAI Key',
        vars: [{ name: 'OPENAI_API_KEY', label: 'API Key', secret: true }],
      } as AuthMethod,
    ]);

    expect(protocol.authenticate).not.toHaveBeenCalled();
  });

  it('authenticate skips when authMethods is empty', async () => {
    const neg = new AuthNegotiator('claude');
    neg.mergeCredentials({ ANTHROPIC_API_KEY: 'sk-123' });

    const protocol = { authenticate: vi.fn() };
    await neg.authenticate(protocol, []);

    expect(protocol.authenticate).not.toHaveBeenCalled();
  });

  it('authenticate skips non-env_var methods', async () => {
    const neg = new AuthNegotiator('claude');
    neg.mergeCredentials({ ANTHROPIC_API_KEY: 'sk-123' });

    const protocol = { authenticate: vi.fn() };
    await neg.authenticate(protocol, [terminalMethod(), agentMethod()]);

    expect(protocol.authenticate).not.toHaveBeenCalled();
  });

  it('authenticate throws AUTH_REQUIRED when protocol.authenticate rejects', async () => {
    const neg = new AuthNegotiator('codex');
    neg.mergeCredentials({ OPENAI_API_KEY: 'sk-bad' });

    const protocol = { authenticate: vi.fn().mockRejectedValue(new Error('Invalid key')) };
    await expect(
      neg.authenticate(protocol, [
        {
          id: 'openai_key',
          type: 'env_var',
          name: 'OpenAI Key',
          vars: [{ name: 'OPENAI_API_KEY', label: 'API Key', secret: true }],
        } as AuthMethod,
      ])
    ).rejects.toThrow('Authentication required');
  });

  it('authenticate selects first method with all fields present', async () => {
    const neg = new AuthNegotiator('codex');
    neg.mergeCredentials({ OPENAI_API_KEY: 'sk-test', OPENAI_ORG_ID: 'org-123' });

    const protocol = { authenticate: vi.fn().mockResolvedValue(undefined) };
    await neg.authenticate(protocol, [
      {
        id: 'full_auth',
        type: 'env_var',
        name: 'Full Auth',
        vars: [
          { name: 'OPENAI_API_KEY', label: 'API Key', secret: true },
          { name: 'OPENAI_ORG_ID', label: 'Org ID', secret: false },
          { name: 'MISSING_FIELD', label: 'Missing', secret: false },
        ],
      } as AuthMethod,
      {
        id: 'key_only',
        type: 'env_var',
        name: 'Key Only',
        vars: [{ name: 'OPENAI_API_KEY', label: 'API Key', secret: true }],
      } as AuthMethod,
    ]);

    // Should pick 'key_only' — first method where ALL vars are present
    expect(protocol.authenticate).toHaveBeenCalledWith('key_only');
  });
});
