/**
 * @license
 * Copyright 2025 POUNDING
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression tests for the managed CLI sync pipeline.
 *
 * Covers:
 *   - Model ID mapping roundtrip (build ↔ resolve)
 *   - Provider ID edge cases
 *   - Capability matrix regression scenarios (dependency missing,
 *     unsupported hot-switch, OpenClaw session requirement)
 *   - Structured verification output (not string-containment)
 */

import { describe, expect, it } from 'vitest';
import type { ManagedRuntimeCliTarget } from '@/common/types/newApiAccount';
import {
  MANAGED_RUNTIME_CLI_TARGETS,
  MANAGED_CLI_CAPABILITIES,
  getManagedRuntimeProviderId,
  isManagedRuntimeProviderId,
  buildManagedRuntimeModelId,
  normalizeClaudeManagedModelId,
  resolveManagedRuntimeConversationModelId,
  resolveManagedModelIdFromRuntime,
  getManagedRuntimeProviderIdAliases,
  normalizeManagedRuntimeModelLabel,
  isAcpTarget,
  supportsHotSwitch,
  requiresNewConversationForModelChange,
  supportsResume,
} from '@/common/types/agent/managedRuntimeCli';

// ─── Model ID roundtrip ──────────────────────────────────────────────────

describe('model ID roundtrip', () => {
  const MODEL = 'gpt-4o';

  const EXPECTED: Record<ManagedRuntimeCliTarget, string> = {
    claude: 'gpt-4o',
    hermes: 'custom:gpt-4o',
    opencode: `${getManagedRuntimeProviderId()}/gpt-4o`,
    openclaw: `${getManagedRuntimeProviderId()}/gpt-4o`,
  };

  for (const target of MANAGED_RUNTIME_CLI_TARGETS) {
    it(`${target}: buildManagedRuntimeModelId → resolveManagedModelIdFromRuntime roundtrip`, () => {
      const cliId = buildManagedRuntimeModelId(target, MODEL);
      expect(cliId).toBe(EXPECTED[target]);

      const roundtrip = resolveManagedModelIdFromRuntime(target, cliId);
      expect(roundtrip).toBe(MODEL);
    });
  }

  it('resolveManagedModelIdFromRuntime returns undefined for Claude native slots', () => {
    for (const slot of ['default', 'opus', 'sonnet', 'haiku']) {
      expect(resolveManagedModelIdFromRuntime('claude', slot)).toBeUndefined();
    }
  });

  it('resolveManagedModelIdFromRuntime returns undefined for unknown Hermes prefix', () => {
    expect(resolveManagedModelIdFromRuntime('hermes', 'native:gpt-4o')).toBeUndefined();
  });

  it('resolveManagedModelIdFromRuntime handles OpenCode model ID without managed prefix', () => {
    // If the model ID doesn't have a managed prefix, it should be returned as-is
    const result = resolveManagedModelIdFromRuntime('opencode', 'some-other-provider/gpt-4o');
    expect(result).toBe('some-other-provider/gpt-4o');
  });
});

// ─── normalizeManagedRuntimeModelLabel ────────────────────────────────────

describe('normalizeManagedRuntimeModelLabel', () => {
  it('strips "New API /" prefix', () => {
    expect(normalizeManagedRuntimeModelLabel('claude', 'New API / gpt-4o')).toBe('gpt-4o');
  });

  it('strips "POUNDING API /" prefix', () => {
    expect(normalizeManagedRuntimeModelLabel('claude', 'POUNDING API / gpt-4o')).toBe('gpt-4o');
  });

  it('passes through non-managed labels', () => {
    expect(normalizeManagedRuntimeModelLabel('claude', 'claude-sonnet-4')).toBe('claude-sonnet-4');
  });

  it('returns undefined for null/undefined', () => {
    expect(normalizeManagedRuntimeModelLabel('claude', null)).toBeUndefined();
    expect(normalizeManagedRuntimeModelLabel('claude', undefined)).toBeUndefined();
  });
});

describe('normalizeClaudeManagedModelId', () => {
  it('passes through managed provider models', () => {
    expect(normalizeClaudeManagedModelId('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    expect(normalizeClaudeManagedModelId('MiniMax-M2.7-highspeed')).toBe('MiniMax-M2.7-highspeed');
  });

  it('preserves explicit Claude native slots', () => {
    expect(normalizeClaudeManagedModelId('opus')).toBe('opus');
    expect(normalizeClaudeManagedModelId('haiku')).toBe('haiku');
  });

  it('returns undefined for empty values', () => {
    expect(normalizeClaudeManagedModelId('')).toBeUndefined();
    expect(normalizeClaudeManagedModelId(undefined)).toBeUndefined();
  });
});

describe('resolveManagedRuntimeConversationModelId', () => {
  it('passes through managed model IDs for Claude', () => {
    expect(resolveManagedRuntimeConversationModelId('claude', 'MiniMax-M2.7-highspeed')).toBe('MiniMax-M2.7-highspeed');
    expect(resolveManagedRuntimeConversationModelId('claude', 'opus')).toBe('opus');
  });

  it('builds managed model ids for OpenCode and OpenClaw', () => {
    expect(resolveManagedRuntimeConversationModelId('opencode', 'gpt-4o')).toBe('gpt-4o');
    expect(resolveManagedRuntimeConversationModelId('openclaw', 'gpt-4o')).toBe('gpt-4o');
  });
});

// ─── Provider ID ─────────────────────────────────────────────────────────

describe('provider ID', () => {
  it('getManagedRuntimeProviderId returns expected prefix', () => {
    const id = getManagedRuntimeProviderId();
    expect(id).toMatch(/^pounding-/);
  });

  it('isManagedRuntimeProviderId matches pounding- prefix', () => {
    expect(isManagedRuntimeProviderId('pounding-my-provider')).toBe(true);
    expect(isManagedRuntimeProviderId('pounding-')).toBe(true);
  });

  it('isManagedRuntimeProviderId matches legacy aionui- prefix', () => {
    expect(isManagedRuntimeProviderId('aionui-my-provider')).toBe(true);
  });

  it('isManagedRuntimeProviderId returns false for unrelated ids', () => {
    expect(isManagedRuntimeProviderId(null)).toBe(false);
    expect(isManagedRuntimeProviderId(undefined)).toBe(false);
    expect(isManagedRuntimeProviderId('')).toBe(false);
    expect(isManagedRuntimeProviderId('anthropic')).toBe(false);
    expect(isManagedRuntimeProviderId('openai/gpt-4o')).toBe(false);
  });

  it('getManagedRuntimeProviderIdAliases returns both old and new prefixes', () => {
    const aliases = getManagedRuntimeProviderIdAliases();
    expect(aliases.some((a) => a.startsWith('pounding-'))).toBe(true);
    expect(aliases.some((a) => a.startsWith('aionui-'))).toBe(true);
  });
});

// ─── Capability matrix regression scenarios ───────────────────────────────

describe('capability matrix regression', () => {
  // TS-5.2: Hot-switch support
  it('Claude / Hermes / OpenCode support hot switch, OpenClaw does not', () => {
    expect(supportsHotSwitch('claude')).toBe(true);
    expect(supportsHotSwitch('hermes')).toBe(true);
    expect(supportsHotSwitch('opencode')).toBe(true);
    expect(supportsHotSwitch('openclaw')).toBe(false);
  });

  // TS-5.3: OpenClaw requires new conversation for model change
  it('only OpenClaw requires new conversation for model change', () => {
    expect(requiresNewConversationForModelChange('claude')).toBe(false);
    expect(requiresNewConversationForModelChange('hermes')).toBe(false);
    expect(requiresNewConversationForModelChange('opencode')).toBe(false);
    expect(requiresNewConversationForModelChange('openclaw')).toBe(true);
  });

  // TS-7: OpenClaw must NOT be classified as ACP
  it('OpenClaw is NOT an ACP target', () => {
    expect(isAcpTarget('openclaw')).toBe(false);
  });

  it('Claude / Hermes / OpenCode ARE ACP targets', () => {
    expect(isAcpTarget('claude')).toBe(true);
    expect(isAcpTarget('hermes')).toBe(true);
    expect(isAcpTarget('opencode')).toBe(true);
  });

  // Resume support
  it('Claude / Hermes support resume, OpenCode uses new-session, OpenClaw N/A', () => {
    expect(supportsResume('claude')).toBe(true);
    expect(supportsResume('hermes')).toBe(true);
    expect(supportsResume('opencode')).toBe(false);
    expect(supportsResume('openclaw')).toBe(false);
  });

  // Secret mode per CLI (regression: no raw stderr in config)
  it('Claude uses env_injected, Hermes env_referenced, OpenCode/OpenClaw config_file_plain', () => {
    expect(MANAGED_CLI_CAPABILITIES.claude.secretMode).toBe('env_injected');
    expect(MANAGED_CLI_CAPABILITIES.hermes.secretMode).toBe('env_referenced');
    expect(MANAGED_CLI_CAPABILITIES.opencode.secretMode).toBe('config_file_plain');
    expect(MANAGED_CLI_CAPABILITIES.openclaw.secretMode).toBe('config_file_plain');
  });

  // Config source kind per CLI (regression: structured config, not string-containment)
  it('config source kind per CLI matches design', () => {
    expect(MANAGED_CLI_CAPABILITIES.claude.configSource.kind).toBe('file_plus_env');
    expect(MANAGED_CLI_CAPABILITIES.hermes.configSource.kind).toBe('static_config_plus_env');
    expect(MANAGED_CLI_CAPABILITIES.opencode.configSource.kind).toBe('managed_json_via_env');
    expect(MANAGED_CLI_CAPABILITIES.openclaw.configSource.kind).toBe('static_json');
  });
});

// ─── No generic fallback expectation (TS-7.1) ─────────────────────────────

describe('no generic fallback', () => {
  // This test asserts that the capability matrix does NOT contain any
  // target whose expected test behavior is the old "generic fallback".
  // Every managed CLI must have a defined failure behavior per class.
  for (const target of MANAGED_RUNTIME_CLI_TARGETS) {
    it(`${target}: has a protocol and is properly categorized`, () => {
      const cap = MANAGED_CLI_CAPABILITIES[target];
      expect(cap.protocol).toMatch(/^(acp|websocket)$/);
      expect(cap.hotSwitch).toMatch(/^(supported|requires_new_conversation)$/);
      expect(cap.resume).toMatch(/^(supported|new_session_each_time|not_applicable)$/);
      expect(cap.secretMode).toMatch(/^(env_injected|env_referenced|config_file_plain|dotenv_file)$/);
    });
  }
});
