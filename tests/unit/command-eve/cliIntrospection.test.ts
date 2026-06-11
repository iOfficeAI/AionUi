/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  detectPlaintextSecret,
  isEnvRef,
  redactAgentMcpConfig,
  redactAgentMcpConfigs,
  redactAgentMetadata,
  redactMcpServerConfig,
  type RawAgentMcpConfig,
} from '@/common/runtime/cliIntrospection';
import type { IMcpServer } from '@/common/config/storage';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

// Synthetic token-shaped values. These are NOT real credentials — they exist
// only to prove redaction never copies a value into the output.
const FAKE_INLINE_BEARER = 'Bearer hcho_live_FAKE0000abcdef1234567890ZZ';
const FAKE_OPENAI_KEY = 'sk-FAKE0000abcdefghijklmnopqrstuvwxyz0123';
const FAKE_GITHUB_PAT = 'ghp_FAKE0000abcdefghijklmnopqrstuvwxyz12';
const FAKE_OPAQUE = 'FAKEopaque0000ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
const ENV_REF = '${HONCHO_API_KEY}';

function makeServer(overrides: Partial<IMcpServer> & { transport: IMcpServer['transport'] }): IMcpServer {
  return {
    id: 'srv-1',
    name: 'honcho',
    enabled: true,
    created_at: 0,
    updated_at: 0,
    original_json: '{}',
    ...overrides,
  };
}

describe('cliIntrospection — detectPlaintextSecret', () => {
  it('flags inline token-shaped values', () => {
    expect(detectPlaintextSecret(FAKE_OPENAI_KEY)).toBe(true);
    expect(detectPlaintextSecret(FAKE_GITHUB_PAT)).toBe(true);
    expect(detectPlaintextSecret(FAKE_INLINE_BEARER)).toBe(true);
    expect(detectPlaintextSecret(FAKE_OPAQUE)).toBe(true);
  });

  it('does NOT flag env-var references (the safe form)', () => {
    expect(detectPlaintextSecret('${HONCHO_API_KEY}')).toBe(false);
    expect(detectPlaintextSecret('$HONCHO_API_KEY')).toBe(false);
    expect(detectPlaintextSecret('%HONCHO_API_KEY%')).toBe(false);
  });

  it('does NOT flag empty or short non-token values', () => {
    expect(detectPlaintextSecret('')).toBe(false);
    expect(detectPlaintextSecret('   ')).toBe(false);
    expect(detectPlaintextSecret('debug')).toBe(false);
    expect(detectPlaintextSecret('http://127.0.0.1:11434')).toBe(false);
  });

  it('recognises env refs via isEnvRef', () => {
    expect(isEnvRef(ENV_REF)).toBe(true);
    expect(isEnvRef('plain')).toBe(false);
  });
});

describe('cliIntrospection — redactMcpServerConfig', () => {
  it('projects an stdio server with an inline secret to presence-only', () => {
    const server = makeServer({
      transport: {
        type: 'stdio',
        command: 'honcho-mcp',
        env: {
          HONCHO_API_KEY: FAKE_OPAQUE,
          LOG_LEVEL: 'debug',
        },
      },
    });

    const redacted = redactMcpServerConfig(server);

    expect(redacted.id).toBe('srv-1');
    expect(redacted.transport_type).toBe('stdio');
    expect(redacted.env.HONCHO_API_KEY).toEqual({ present: true, plaintext_secret_detected: true });
    expect(redacted.env.LOG_LEVEL).toEqual({ present: true });
    expect(redacted.has_plaintext_secret).toBe(true);

    // HARD INVARIANT: the synthetic token never appears in the output object.
    expect(JSON.stringify(redacted)).not.toContain(FAKE_OPAQUE);
  });

  it('marks env-var references as present + is_env_ref, never as a secret', () => {
    const server = makeServer({
      transport: {
        type: 'http',
        url: 'https://example.test/mcp',
        headers: {
          Authorization: ENV_REF,
        },
      },
    });

    const redacted = redactMcpServerConfig(server);

    expect(redacted.transport_type).toBe('http');
    expect(redacted.headers.Authorization).toEqual({ present: true, is_env_ref: true });
    expect(redacted.headers.Authorization.plaintext_secret_detected).toBeUndefined();
    expect(redacted.has_plaintext_secret).toBe(false);
    expect(JSON.stringify(redacted)).not.toContain('HONCHO_API_KEY');
  });

  it('flags an inline Bearer header as a plaintext secret without leaking it', () => {
    const server = makeServer({
      transport: {
        type: 'streamable_http',
        url: 'https://example.test/mcp',
        headers: {
          Authorization: FAKE_INLINE_BEARER,
        },
      },
    });

    const redacted = redactMcpServerConfig(server);

    expect(redacted.headers.Authorization).toEqual({ present: true, plaintext_secret_detected: true });
    expect(redacted.has_plaintext_secret).toBe(true);
    expect(JSON.stringify(redacted)).not.toContain(FAKE_INLINE_BEARER);
    expect(JSON.stringify(redacted)).not.toContain('hcho_live_FAKE');
  });
});

describe('cliIntrospection — redactAgentMetadata', () => {
  it('projects an agent env array to presence-only, flagging inline secrets', () => {
    const agent = {
      id: 'codex',
      name: 'Codex',
      backend: 'codex',
      agent_type: 'acp',
      agent_source: 'builtin',
      enabled: true,
      available: true,
      env: [
        { name: 'OPENAI_API_KEY', value: FAKE_OPENAI_KEY },
        { name: 'HONCHO_API_KEY', value: ENV_REF },
        { name: 'RUST_LOG', value: 'info' },
      ],
    } as AgentMetadata;

    const redacted = redactAgentMetadata(agent);

    expect(redacted.id).toBe('codex');
    expect(redacted.available).toBe(true);
    expect(redacted.env.OPENAI_API_KEY).toEqual({ present: true, plaintext_secret_detected: true });
    expect(redacted.env.HONCHO_API_KEY).toEqual({ present: true, is_env_ref: true });
    expect(redacted.env.RUST_LOG).toEqual({ present: true });
    expect(redacted.has_plaintext_secret).toBe(true);

    expect(JSON.stringify(redacted)).not.toContain(FAKE_OPENAI_KEY);
  });

  it('handles an agent with no env array', () => {
    const agent = {
      id: 'claude',
      name: 'Claude',
      agent_type: 'acp',
      agent_source: 'builtin',
      enabled: true,
      available: false,
    } as AgentMetadata;

    const redacted = redactAgentMetadata(agent);
    expect(redacted.env).toEqual({});
    expect(redacted.available).toBe(false);
    expect(redacted.has_plaintext_secret).toBe(false);
  });
});

describe('cliIntrospection — redactAgentMcpConfig(s)', () => {
  it('redacts a source group and rolls up the plaintext flag', () => {
    const config: RawAgentMcpConfig = {
      source: '~/.codex/config.toml',
      servers: [
        makeServer({
          id: 'honcho',
          name: 'honcho',
          transport: {
            type: 'stdio',
            command: 'honcho-mcp',
            env: { HONCHO_API_KEY: FAKE_OPAQUE },
          },
          importable: true,
        }),
        makeServer({
          id: 'gitnexus',
          name: 'gitnexus',
          transport: {
            type: 'stdio',
            command: 'gitnexus',
            env: { GITNEXUS_TOKEN: ENV_REF },
          },
          importable: true,
        }),
      ],
    };

    const redacted = redactAgentMcpConfig(config);

    expect(redacted.source).toBe('~/.codex/config.toml');
    expect(redacted.servers).toHaveLength(2);
    expect(redacted.has_plaintext_secret).toBe(true); // honcho carries an inline token
    expect(redacted.servers[1].has_plaintext_secret).toBe(false); // gitnexus uses an env ref

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain(FAKE_OPAQUE);
    expect(serialized).not.toContain('GITNEXUS_TOKEN_VALUE');
  });

  it('redacts a full multi-source array', () => {
    const configs: RawAgentMcpConfig[] = [
      {
        source: 'codex',
        servers: [
          makeServer({
            id: 's1',
            transport: { type: 'stdio', command: 'x', env: { K: ENV_REF } },
          }),
        ],
      },
    ];

    const redacted = redactAgentMcpConfigs(configs);
    expect(redacted).toHaveLength(1);
    expect(redacted[0].has_plaintext_secret).toBe(false);
  });
});
