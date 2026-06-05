/**
 * @license
 * Copyright 2025 POUNDING
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contract tests for the managed CLI capability matrix.
 *
 * If these fail, the matrix has changed — every consumer that depends
 * on these properties must be reviewed.
 */

import { describe, expect, it } from 'vitest';
import {
  MANAGED_RUNTIME_CLI_TARGETS,
  MANAGED_CLI_CAPABILITIES,
  type ManagedRuntimeCliTarget,
} from '@/common/types/agent/managedRuntimeCli';

describe('MANAGED_CLI_CAPABILITIES', () => {
  // ─── Completeness ────────────────────────────────────────────────────

  it('covers every known ManagedRuntimeCliTarget', () => {
    for (const target of MANAGED_RUNTIME_CLI_TARGETS) {
      expect(MANAGED_CLI_CAPABILITIES[target]).toBeDefined();
    }
    // No extra keys beyond the targets enum
    const keys = Object.keys(MANAGED_CLI_CAPABILITIES) as ManagedRuntimeCliTarget[];
    expect(keys.toSorted()).toEqual([...MANAGED_RUNTIME_CLI_TARGETS].toSorted());
  });

  it('every entry has all required fields', () => {
    for (const target of MANAGED_RUNTIME_CLI_TARGETS) {
      const cap = MANAGED_CLI_CAPABILITIES[target];
      expect(cap.target).toBe(target);
      expect(['acp', 'websocket']).toContain(cap.protocol);
      expect(['env_injected', 'env_referenced', 'config_file_plain', 'dotenv_file']).toContain(cap.secretMode);
      expect(['supported', 'requires_new_conversation']).toContain(cap.hotSwitch);
      expect(['supported', 'new_session_each_time', 'not_applicable']).toContain(cap.resume);
      expect(typeof cap.label).toBe('string');
      expect(cap.label.length).toBeGreaterThan(0);
    }
  });

  // ─── Protocol ────────────────────────────────────────────────────────

  it('three ACP, one WebSocket', () => {
    const acpCount = MANAGED_RUNTIME_CLI_TARGETS.filter((t) => MANAGED_CLI_CAPABILITIES[t].protocol === 'acp').length;
    const wsCount = MANAGED_RUNTIME_CLI_TARGETS.filter(
      (t) => MANAGED_CLI_CAPABILITIES[t].protocol === 'websocket'
    ).length;
    expect(acpCount).toBe(3);
    expect(wsCount).toBe(1);
    expect(MANAGED_CLI_CAPABILITIES.claude.protocol).toBe('acp');
    expect(MANAGED_CLI_CAPABILITIES.hermes.protocol).toBe('acp');
    expect(MANAGED_CLI_CAPABILITIES.opencode.protocol).toBe('acp');
    expect(MANAGED_CLI_CAPABILITIES.openclaw.protocol).toBe('websocket');
  });

  // ─── Hot switch ──────────────────────────────────────────────────────

  it('three CLIs support hot switch, OpenClaw requires new conversation', () => {
    const hotOk = MANAGED_RUNTIME_CLI_TARGETS.filter((t) => MANAGED_CLI_CAPABILITIES[t].hotSwitch === 'supported');
    const hotNew = MANAGED_RUNTIME_CLI_TARGETS.filter(
      (t) => MANAGED_CLI_CAPABILITIES[t].hotSwitch === 'requires_new_conversation'
    );
    expect(hotOk).toContain('claude');
    expect(hotOk).toContain('hermes');
    expect(hotOk).toContain('opencode');
    expect(hotNew).toContain('openclaw');
  });

  // ─── Resume ──────────────────────────────────────────────────────────

  it('Claude/Hermes support resume, OpenCode new-session, OpenClaw N/A', () => {
    const resumeOk = MANAGED_RUNTIME_CLI_TARGETS.filter((t) => MANAGED_CLI_CAPABILITIES[t].resume === 'supported');
    const resumeNew = MANAGED_RUNTIME_CLI_TARGETS.filter(
      (t) => MANAGED_CLI_CAPABILITIES[t].resume === 'new_session_each_time'
    );
    const resumeNa = MANAGED_RUNTIME_CLI_TARGETS.filter((t) => MANAGED_CLI_CAPABILITIES[t].resume === 'not_applicable');
    expect(resumeOk).toContain('claude');
    expect(resumeOk).toContain('hermes');
    expect(resumeNew).toContain('opencode');
    expect(resumeNa).toContain('openclaw');
  });

  // ─── Secret mode ─────────────────────────────────────────────────────

  it('secret modes match per-CLI design', () => {
    expect(MANAGED_CLI_CAPABILITIES.claude.secretMode).toBe('env_injected');
    expect(MANAGED_CLI_CAPABILITIES.hermes.secretMode).toBe('env_referenced');
    expect(MANAGED_CLI_CAPABILITIES.opencode.secretMode).toBe('config_file_plain');
    expect(MANAGED_CLI_CAPABILITIES.openclaw.secretMode).toBe('config_file_plain');
  });

  // ─── Config source ───────────────────────────────────────────────────

  it('configSource kind matches expected per target', () => {
    expect(MANAGED_CLI_CAPABILITIES.claude.configSource.kind).toBe('file_plus_env');
    expect(MANAGED_CLI_CAPABILITIES.hermes.configSource.kind).toBe('static_config_plus_env');
    expect(MANAGED_CLI_CAPABILITIES.opencode.configSource.kind).toBe('managed_json_via_env');
    expect(MANAGED_CLI_CAPABILITIES.openclaw.configSource.kind).toBe('static_json');
  });

  it('Claude configSource has non-empty envKeys', () => {
    const cs = MANAGED_CLI_CAPABILITIES.claude.configSource;
    if (cs.kind === 'file_plus_env') {
      expect(cs.envKeys.length).toBeGreaterThan(0);
      expect(cs.envKeys).toContain('ANTHROPIC_BASE_URL');
      expect(cs.envKeys).toContain('ANTHROPIC_API_KEY');
    }
  });

  it('Hermes configSource has non-empty envRefKey', () => {
    const cs = MANAGED_CLI_CAPABILITIES.hermes.configSource;
    if (cs.kind === 'static_config_plus_env') {
      expect(cs.envRefKey.length).toBeGreaterThan(0);
    }
  });

  it('OpenCode configSource has non-empty envOverrideKey', () => {
    const cs = MANAGED_CLI_CAPABILITIES.opencode.configSource;
    if (cs.kind === 'managed_json_via_env') {
      expect(cs.envOverrideKey.length).toBeGreaterThan(0);
    }
  });
});
