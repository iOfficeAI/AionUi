/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the pinned agent install-command table and the OS platform
 * detection used to pick the right command.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_INSTALL_GUIDANCE,
  getAgentInstallCommand,
  getAgentInstallGuidance,
} from '@/renderer/pages/settings/AgentSettings/agentInstallCommands';
import { detectAgentPlatform } from '@/renderer/pages/settings/AgentSettings/agentInstallPlatform';

describe('agentInstallCommands', () => {
  it('covers the expected pinned backends', () => {
    expect(Object.keys(AGENT_INSTALL_GUIDANCE).sort()).toEqual(['claude', 'codex', 'gemini', 'qwen']);
  });

  it('provides a non-empty install command for every platform of every pinned backend', () => {
    for (const entry of Object.values(AGENT_INSTALL_GUIDANCE)) {
      for (const platform of ['macos', 'linux', 'windows'] as const) {
        expect(entry.commands[platform].trim().length).toBeGreaterThan(0);
      }
      expect(entry.docsUrl.startsWith('https://')).toBe(true);
    }
  });

  it('uses the official npm package name verified to exist', () => {
    expect(AGENT_INSTALL_GUIDANCE.claude.commands.macos).toContain('@anthropic-ai/claude-code');
    expect(AGENT_INSTALL_GUIDANCE.codex.commands.macos).toContain('@openai/codex');
    expect(AGENT_INSTALL_GUIDANCE.gemini.commands.macos).toContain('@google/gemini-cli');
  });

  it('resolves guidance by backend and returns undefined for unknown backends', () => {
    expect(getAgentInstallGuidance('claude')?.docsUrl).toContain('anthropic');
    expect(getAgentInstallGuidance('gemini')?.backend).toBe('gemini');
    expect(getAgentInstallGuidance(null)).toBeUndefined();
    expect(getAgentInstallGuidance('totally-unknown')).toBeUndefined();
  });

  it('picks the command for the requested platform', () => {
    const guidance = getAgentInstallGuidance('codex')!;
    expect(getAgentInstallCommand(guidance, 'macos')).toContain('@openai/codex');
    expect(getAgentInstallCommand(guidance, 'windows')).toContain('@openai/codex');
  });
});

describe('detectAgentPlatform', () => {
  it('maps macOS platform strings', () => {
    expect(detectAgentPlatform('MacIntel')).toBe('macos');
    expect(detectAgentPlatform('macOS')).toBe('macos');
  });

  it('maps Windows', () => {
    expect(detectAgentPlatform('Win32')).toBe('windows');
    expect(detectAgentPlatform('Windows NT 10.0')).toBe('windows');
  });

  it('defaults Linux / unknown to linux', () => {
    expect(detectAgentPlatform('Linux x86_64')).toBe('linux');
    expect(detectAgentPlatform('')).toBe('linux');
    // With no navigator (headless), an omitted input falls back to linux.
    vi.stubGlobal('navigator', undefined);
    expect(detectAgentPlatform(undefined)).toBe('linux');
    vi.unstubAllGlobals();
  });
});
