/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ACP_BACKENDS_ALL } from '../../src/common/types/acpTypes';

/**
 * Tests for assistant editor backend selection (Fixes #1385).
 *
 * The assistant editor previously hardcoded only 6 backends (gemini, claude,
 * qwen, codex, codebuddy, opencode), causing dynamically detected backends
 * like iFlow CLI to be missing from the Main Agent dropdown.
 *
 * The fix replaces the hardcoded list with a dynamic lookup from
 * ACP_BACKENDS_ALL, so any detected backend is shown.
 */
describe('Assistant edit drawer backend options', () => {
  // Simulate the same logic used in AssistantEditDrawer.tsx to build options
  function buildBackendOptions(availableBackends: Set<string>) {
    return Array.from(availableBackends).map((id) => {
      const config = ACP_BACKENDS_ALL[id as keyof typeof ACP_BACKENDS_ALL];
      return { value: id, label: config?.name ?? id };
    });
  }

  it('includes iflow when it is in availableBackends', () => {
    const available = new Set(['gemini', 'claude', 'iflow']);
    const options = buildBackendOptions(available);

    const iflowOption = options.find((opt) => opt.value === 'iflow');
    expect(iflowOption).toBeDefined();
    expect(iflowOption!.label).toBe('iFlow CLI');
  });

  it('includes all detected backends, not just a hardcoded subset', () => {
    const available = new Set(['gemini', 'claude', 'qwen', 'iflow', 'goose', 'kimi', 'copilot']);
    const options = buildBackendOptions(available);

    expect(options).toHaveLength(7);
    const values = options.map((o) => o.value);
    expect(values).toContain('iflow');
    expect(values).toContain('goose');
    expect(values).toContain('kimi');
    expect(values).toContain('copilot');
  });

  it('falls back to id as label for unknown backends', () => {
    const available = new Set(['some-unknown-backend']);
    const options = buildBackendOptions(available);

    expect(options[0]).toEqual({ value: 'some-unknown-backend', label: 'some-unknown-backend' });
  });

  it('uses correct display names from ACP_BACKENDS_ALL', () => {
    const available = new Set(['claude', 'codex', 'codebuddy']);
    const options = buildBackendOptions(available);

    expect(options).toEqual([
      { value: 'claude', label: 'Claude Code' },
      { value: 'codex', label: 'Codex' },
      { value: 'codebuddy', label: 'CodeBuddy' },
    ]);
  });

  it('ACP_BACKENDS_ALL contains iflow as an enabled backend', () => {
    expect(ACP_BACKENDS_ALL.iflow).toBeDefined();
    expect(ACP_BACKENDS_ALL.iflow.enabled).toBe(true);
    expect(ACP_BACKENDS_ALL.iflow.name).toBe('iFlow CLI');
  });
});
