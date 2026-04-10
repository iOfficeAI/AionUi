/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the team guide MCP injection whitelist filter.
 * Covers: which agent backends get the Aion team guide MCP injected,
 * and which are excluded.
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
import { shouldInjectTeamGuideMcp } from '../../src/process/resources/prompts/teamGuidePrompt';

describe('team guide MCP injection whitelist', () => {
  describe('allowed backends — should inject team guide MCP', () => {
    it('injects for claude backend', () => {
      expect(shouldInjectTeamGuideMcp('claude')).toBe(true);
    });

    it('injects for codex backend', () => {
      expect(shouldInjectTeamGuideMcp('codex')).toBe(true);
    });
  });

  describe('blocked backends — should NOT inject team guide MCP', () => {
    it('does not inject for qwen backend', () => {
      expect(shouldInjectTeamGuideMcp('qwen')).toBe(false);
    });

    it('does not inject for gemini backend', () => {
      expect(shouldInjectTeamGuideMcp('gemini')).toBe(false);
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
});
