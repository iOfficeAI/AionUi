/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the team guide MCP injection whitelist filter and prompt wording.
 * Covers: which agent backends get the Aion team guide MCP injected,
 * which are excluded, and the solo-vs-team guardrails in the prompt.
 *
 * Target module: src/process/resources/prompts/teamGuidePrompt.ts
 * (or wherever shouldInjectTeamGuideMcp / TEAM_GUIDE_MCP_WHITELIST is exported from)
 */

import { describe, it, expect } from 'vitest';

// ------------------------------------------------------------------
// Import the whitelist predicate once the module exists.
// The function signature expected by these tests:
//   shouldInjectTeamGuideMcp(backend: string): boolean
// ------------------------------------------------------------------
import {
  getCreateTeamToolDescription,
  getTeamGuidePrompt,
  shouldInjectTeamGuideMcp,
} from '../../src/process/resources/prompts/teamGuidePrompt';

describe('team guide MCP injection whitelist', () => {
  describe('allowed backends — should inject team guide MCP', () => {
    it('injects for claude backend', () => {
      expect(shouldInjectTeamGuideMcp('claude')).toBe(true);
    });

    it('injects for codex backend', () => {
      expect(shouldInjectTeamGuideMcp('codex')).toBe(true);
    });

    it('injects for gemini backend', () => {
      expect(shouldInjectTeamGuideMcp('gemini')).toBe(true);
    });
  });

  describe('blocked backends — should NOT inject team guide MCP', () => {
    it('does not inject for qwen backend', () => {
      expect(shouldInjectTeamGuideMcp('qwen')).toBe(false);
    });

    it('does not inject for opencode backend', () => {
      expect(shouldInjectTeamGuideMcp('opencode')).toBe(false);
    });

    it('does not inject for iflow backend', () => {
      expect(shouldInjectTeamGuideMcp('iflow')).toBe(false);
    });

    it('does not inject for aionrs backend', () => {
      expect(shouldInjectTeamGuideMcp('aionrs')).toBe(false);
    });

    it('does not inject for cursor backend', () => {
      expect(shouldInjectTeamGuideMcp('cursor')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('does not inject for unknown backend', () => {
      expect(shouldInjectTeamGuideMcp('unknown-backend')).toBe(false);
    });

    it('does not inject for empty string', () => {
      expect(shouldInjectTeamGuideMcp('')).toBe(false);
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

    it('requires explicit user intent or explicit approval before creating a team', () => {
      const toolDescription = getCreateTeamToolDescription();

      expect(toolDescription).toContain('The user explicitly asked to create a Team');
      expect(toolDescription).toContain('The user explicitly confirmed in a PREVIOUS message');
      expect(toolDescription).toContain('Do NOT use just because the task is substantial, multi-file, iterative');
    });
  });
});
