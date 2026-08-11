/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the team guide MCP injection capability check and prompt wording.
 * Covers: which agent backends get the Aion team guide MCP injected based on
 * cached ACP initialize results, which are excluded, and the solo-vs-team
 * guardrails in the prompt.
 *
 * Target module: src/process/team/prompts/teamGuidePrompt.ts
 */

import { describe, it, expect, vi } from 'vitest';

// Mock ProcessConfig to return cached init results for claude, codex (gemini is always team-capable)
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        const makeEntry = () => ({
          protocolVersion: 1,
          capabilities: {
            loadSession: false,
            promptCapabilities: { image: false, audio: false, embeddedContext: false },
            mcpCapabilities: { stdio: true, http: false, sse: false },
            sessionCapabilities: { fork: null, resume: null, list: null, close: null },
            _meta: {},
          },
          agentInfo: null,
          authMethods: [],
        });
        return { claude: makeEntry(), codex: makeEntry() };
      }
      return null;
    }),
  },
}));

import { getCreateTeamToolDescription, getTeamGuidePrompt } from '../../src/process/team/prompts/teamGuidePrompt';
import { shouldInjectTeamGuideMcp } from '../../src/process/team/prompts/teamGuideCapability';

describe('team guide MCP injection capability check', () => {
  describe('allowed backends — should inject team guide MCP', () => {
    it('injects for claude backend (known team-capable)', async () => {
      expect(await shouldInjectTeamGuideMcp('claude')).toBe(true);
    });

    it('injects for codex backend (known team-capable)', async () => {
      expect(await shouldInjectTeamGuideMcp('codex')).toBe(true);
    });

    it('injects for gemini backend (known team-capable)', async () => {
      expect(await shouldInjectTeamGuideMcp('gemini')).toBe(true);
    });

    it('injects for aionrs backend (known team-capable)', async () => {
      expect(await shouldInjectTeamGuideMcp('aionrs')).toBe(true);
    });
  });

  describe('blocked backends — should NOT inject team guide MCP', () => {
    it('does not inject for qwen backend (no cached init result)', async () => {
      expect(await shouldInjectTeamGuideMcp('qwen')).toBe(false);
    });

    it('does not inject for opencode backend (no cached init result)', async () => {
      expect(await shouldInjectTeamGuideMcp('opencode')).toBe(false);
    });

    it('does not inject for cursor backend (no cached init result)', async () => {
      expect(await shouldInjectTeamGuideMcp('cursor')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('does not inject for unknown backend', async () => {
      expect(await shouldInjectTeamGuideMcp('unknown-backend')).toBe(false);
    });

    it('does not inject for empty string', async () => {
      expect(await shouldInjectTeamGuideMcp('')).toBe(false);
    });
  });

  describe('solo-vs-team guidance prompt', () => {
    it('keeps solo work as the default and limits proactive team escalation', () => {
      const prompt = getTeamGuidePrompt('gemini');

      expect(prompt).toContain('Handle the task yourself in the current chat by default.');
      expect(prompt).toContain('ask at most once whether the user wants to bring in a Team');
      expect(prompt).toContain('| Leader | Coordinate and review | gemini |');
      expect(prompt).not.toContain('Task spans multiple files, modules, or domains');
    });

    it('labels the Leader row with the preset assistant name when one is active', () => {
      const prompt = getTeamGuidePrompt({ backend: 'gemini', leaderLabel: 'Word Creator' });

      expect(prompt).toContain('| Leader | Coordinate and review | Word Creator (gemini) |');
      // Other roles keep backend-only labels so the leader stays visually distinct.
      expect(prompt).toContain('| Developer | Implement features | gemini |');
      expect(prompt).toContain('| Tester | Write and run tests | gemini |');
    });

    it('accepts a legacy string backend for backward compatibility', () => {
      const prompt = getTeamGuidePrompt('claude');
      expect(prompt).toContain('| Leader | Coordinate and review | claude |');
    });

    it('requires explicit user intent or explicit approval before creating a team', () => {
      const toolDescription = getCreateTeamToolDescription();

      expect(toolDescription).toContain('The user explicitly asked to create a Team');
      expect(toolDescription).toContain('The user explicitly confirmed in a PREVIOUS message');
      expect(toolDescription).toContain('Do NOT use just because the task is substantial, multi-file, iterative');
    });
  });
});
