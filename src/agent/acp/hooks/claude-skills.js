/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Claude Code Skills Integration - Module-Based Hooks
 *
 * This module provides hooks for Claude Code backend to:
 * 1. Sync enabled skills to workspace .claude/skills/ via symlinks
 * 2. Auto-inject /skill commands into user prompts
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

module.exports = {
  /**
   * Workspace initialization hook
   * Syncs enabled skills from app data to workspace .claude/skills/
   */
  onWorkspaceInit: {
    handler: async (context) => {
      const { workspace, enabledSkills, utils, backend } = context;

      if (backend !== 'claude') {
        // Only run for Claude backend
        return;
      }

      if (!utils || !enabledSkills || enabledSkills.length === 0) {
        console.log('[claude-hooks] No skills to sync');
        return;
      }

      try {
        // Create .claude/skills directory
        const claudeSkillsDir = path.join(workspace, '.claude', 'skills');
        await utils.ensureDir(claudeSkillsDir);

        // Symlink builtin skills (always included)
        try {
          await utils.symlinkSkill('_builtin', claudeSkillsDir);
          console.log('[claude-hooks] Synced builtin skills');
        } catch (error) {
          console.warn('[claude-hooks] Failed to sync builtin skills:', error.message);
        }

        // Symlink each enabled skill
        for (const skillName of enabledSkills) {
          try {
            await utils.symlinkSkill(skillName, claudeSkillsDir);
            console.log(`[claude-hooks] Synced skill: ${skillName}`);
          } catch (error) {
            console.warn(`[claude-hooks] Failed to sync skill ${skillName}:`, error.message);
          }
        }

        console.log(`[claude-hooks] Workspace initialized with ${enabledSkills.length} skills`);
      } catch (error) {
        console.error('[claude-hooks] Error during workspace initialization:', error);
      }
    },
    priority: 10, // High priority for workspace setup
  },

  /**
   * First message hook for Claude backend
   * Injects preset rules (assistant persona/workflow) into first message only.
   * Skills are NOT injected here — Claude loads them natively via .claude/skills/ symlinks.
   */
  onFirstMessage: {
    handler: async (context) => {
      if (context.backend !== 'claude') return {};
      console.log('[claude-hooks] onFirstMessage - backend:', context.backend);
      const presetContextLength = context.presetContext ? context.presetContext.length : 0;
      console.log('[claude-hooks] onFirstMessage - has presetContext:', !!context.presetContext, 'length:', presetContextLength);

      if (!context.presetContext) {
        console.log('[claude-hooks] onFirstMessage - No presetContext, skipping injection');
        return {};
      }

      // Verify critical content exists
      const hasCriticalRequirement = context.presetContext.includes('CRITICAL REQUIREMENT');
      const hasDirectiveTag = context.presetContext.includes('<directive>');
      console.log('[claude-hooks] onFirstMessage - presetContext validation:');
      console.log('[claude-hooks]   - Has CRITICAL REQUIREMENT:', hasCriticalRequirement);
      console.log('[claude-hooks]   - Has <directive> tag:', hasDirectiveTag);
      console.log('[claude-hooks]   - First 200 chars:', context.presetContext.substring(0, 200));

      const content = `[Assistant Rules - You MUST follow these instructions]\n${context.presetContext}\n\n[User Request]\n${context.content}`;
      console.log('[claude-hooks] onFirstMessage - injected presetContext, total length:', content.length);
      return { content };
    },
    priority: 10,
  },
};
