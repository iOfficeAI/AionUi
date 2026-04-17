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
 * The fix now builds availableBackends from getAvailableAgents IPC, so any
 * detected backend (including extensions) appears in the dropdown.
 */
describe('Assistant edit drawer backend options', () => {
  it('ACP_BACKENDS_ALL contains iflow as an enabled backend', () => {
    expect(ACP_BACKENDS_ALL.iflow).toBeDefined();
    expect(ACP_BACKENDS_ALL.iflow.enabled).toBe(true);
    expect(ACP_BACKENDS_ALL.iflow.name).toBe('iFlow CLI');
  });

  it('ACP_BACKENDS_ALL has display names for common backends', () => {
    expect(ACP_BACKENDS_ALL.claude.name).toBe('Claude Code');
    expect(ACP_BACKENDS_ALL.codex.name).toBe('Codex');
    expect(ACP_BACKENDS_ALL.codebuddy.name).toBe('CodeBuddy');
  });
});
