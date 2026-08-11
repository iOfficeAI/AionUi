/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildStartupErrorMessage } from '../../src/process/agent/acp/AcpConnection';

describe('buildStartupErrorMessage', () => {
  it('should return generic message with stderr when present', () => {
    const msg = buildStartupErrorMessage('codex', 1, null, 'some error output', undefined, null);
    expect(msg).toBe('codex ACP process exited during startup (code: 1):\nsome error output');
  });

  it('should return generic message with signal when no stderr', () => {
    const msg = buildStartupErrorMessage('codex', 1, 'SIGTERM' as NodeJS.Signals, '', undefined, null);
    expect(msg).toBe('codex ACP process exited during startup (code: 1, signal: SIGTERM)');
  });

  it('should detect "command not found" and provide CLI hint', () => {
    const msg = buildStartupErrorMessage('codex', 127, null, 'codex: command not found', undefined, 'codex');
    expect(msg).toContain("'codex' CLI not found");
    expect(msg).toContain('Please install it or update the CLI path in Settings');
  });

  it('should detect ENOENT in spawnError and provide CLI hint', () => {
    const msg = buildStartupErrorMessage('gemini', 1, null, '', 'spawn gemini ENOENT', 'gemini');
    expect(msg).toContain("'gemini' CLI not found");
  });

  it('should detect config loading error and extract config path', () => {
    const stderr =
      'Error: error loading config: /Users/test/.codex/config.toml:10:1: invalid type: integer `2`, expected struct AgentRoleToml';
    const msg = buildStartupErrorMessage('codex', 1, null, stderr, undefined, null);
    expect(msg).toContain('CLI failed to start due to a config file error');
    expect(msg).toContain('/Users/test/.codex/config.toml');
    expect(msg).toContain('review or temporarily rename');
    expect(msg).toContain(stderr);
  });

  it('should handle config error without extractable path', () => {
    const stderr = 'Error: error loading config';
    const msg = buildStartupErrorMessage('codex', 1, null, stderr, undefined, null);
    expect(msg).toContain('the CLI config file');
  });

  it('should not apply config error detection when exit code is 0', () => {
    const stderr = 'Error: error loading config: /Users/test/.codex/config.toml:10:1';
    const msg = buildStartupErrorMessage('codex', 0, null, stderr, undefined, null);
    expect(msg).not.toContain('config file error');
    expect(msg).toContain('ACP process exited during startup (code: 0)');
  });

  it('should prefer config error over command-not-found when both match', () => {
    // "not found" appears in stderr but so does "error loading config"
    const stderr = 'Error: error loading config: /home/user/.codex/config.toml: file not found';
    const msg = buildStartupErrorMessage('codex', 1, null, stderr, undefined, null);
    // Config error detection runs after command-not-found, so it takes precedence
    expect(msg).toContain('config file error');
  });
});
