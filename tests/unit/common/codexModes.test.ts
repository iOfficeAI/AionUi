/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import {
  CODEX_MODE_FULL_AUTO_NO_SANDBOX,
  isCodexAutoApproveMode,
  isCodexNoSandboxMode,
} from '../../../src/common/types/codex/codexModes';
import {
  getCodexConfigPath,
  getCodexSandboxModeForSessionMode,
} from '../../../src/process/agent/codex/connection/codexConfig';
import { getAgentModes } from '../../../src/renderer/utils/model/agentModes';

describe('codex mode helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exposes an explicit no-sandbox full auto mode for Codex', () => {
    expect(getAgentModes('codex').map((mode) => mode.value)).toContain(CODEX_MODE_FULL_AUTO_NO_SANDBOX);
  });

  it('treats no-sandbox full auto as auto-approve', () => {
    expect(isCodexAutoApproveMode(CODEX_MODE_FULL_AUTO_NO_SANDBOX)).toBe(true);
    expect(isCodexNoSandboxMode(CODEX_MODE_FULL_AUTO_NO_SANDBOX)).toBe(true);
  });

  it('derives sandbox mode from session mode', () => {
    expect(getCodexSandboxModeForSessionMode('default', 'danger-full-access')).toBe('workspace-write');
    expect(getCodexSandboxModeForSessionMode(CODEX_MODE_FULL_AUTO_NO_SANDBOX, 'workspace-write')).toBe(
      'danger-full-access'
    );
    expect(getCodexSandboxModeForSessionMode(undefined, 'danger-full-access')).toBe('danger-full-access');
  });

  it('reads Codex config from CODEX_HOME when provided', () => {
    vi.stubEnv('CODEX_HOME', 'C:\\Users\\tester\\.codex-custom');

    expect(getCodexConfigPath()).toBe('C:\\Users\\tester\\.codex-custom\\config.toml');
  });

  it('falls back to ~/.codex/config.toml', () => {
    vi.stubEnv('CODEX_HOME', '');

    expect(getCodexConfigPath()).toBe(join(homedir(), '.codex', 'config.toml'));
  });
});
