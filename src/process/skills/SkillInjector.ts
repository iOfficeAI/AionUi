/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import type { SkillEntry, AssistantSkillConfig, EffectiveSkills } from './types';
import { SkillRepository } from './SkillRepository';
import { GlobalSkillConfigStore } from './GlobalSkillConfigStore';

/**
 * Agent type to CLI-native skills directory mapping.
 *
 * Each CLI discovers skills from its own directory structure:
 * - Gemini CLI: `.gemini/skills/`
 * - Claude / CodeBuddy: `.claude/skills/`
 * - Others: `.agents/skills/` (generic fallback)
 */
const AGENT_SKILLS_DIRS: Record<string, string[]> = {
  gemini: ['.gemini/skills'],
  claude: ['.claude/skills'],
  codebuddy: ['.claude/skills'],
};

const DEFAULT_SKILLS_DIRS = ['.agents/skills'];

/**
 * Skill index entry for lightweight injection (name + description only).
 */
type SkillIndexItem = {
  name: string;
  description: string;
};

/**
 * SkillInjector — Unified skill injection for all agent types.
 *
 * Replaces the fragmented injection logic spread across:
 * - `AcpSkillManager` (legacy skill discovery + indexing)
 * - `agentUtils.ts` (`buildSystemInstructions`, `prepareFirstMessageWithSkillsIndex`)
 * - `initStorage.ts` (`loadSkillsContent`, `skillsContentCache`)
 * - `initAgent.ts` (`setupAssistantWorkspace`)
 *
 * Three injection pathways:
 *
 * **Pathway 1 — Content Injection (Gemini):**
 *   Full skill content injected into system instructions.
 *   Used when the agent cannot read files on its own.
 *
 * **Pathway 2 — Index Injection (Claude/Codex):**
 *   Skill index + on-demand `[LOAD_SKILL: name]` loading.
 *   Agent reads SKILL.md files via its file-reading tool.
 *
 * **Pathway 3 — Workspace Symlink (CLI-native):**
 *   Symlinks skill directories into the CLI-native skills folder.
 *   The CLI's own SkillManager discovers them natively.
 *
 * Effective skill computation:
 * ```
 * effectiveSkills(assistantId) = Global.enabled + Assistant.added - Assistant.blocked
 * ```
 * When `added` is empty, all globally enabled skills are used.
 */
export class SkillInjector {
  private static instance: SkillInjector | undefined;

  /** Content cache: skill name -> full SKILL.md content (replaces skillsContentCache) */
  private contentCache = new Map<string, string>();

  private constructor() {}

  /** Get singleton instance. */
  static getInstance(): SkillInjector {
    if (!SkillInjector.instance) {
      SkillInjector.instance = new SkillInjector();
    }
    return SkillInjector.instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    SkillInjector.instance = undefined;
  }

  // ---------------------------------------------------------------------------
  // Effective skill computation
  // ---------------------------------------------------------------------------

  /**
   * Compute the effective skill set for an assistant.
   *
   * Formula: `Global.enabled + Assistant.added - Assistant.blocked`
   * - When `added` is empty, all globally enabled skills are included.
   * - When `added` is non-empty, only those skills are included (precise selection mode).
   * - `blocked` skills are always excluded regardless of other config.
   *
   * @param assistantConfig - Per-assistant skill overrides
   * @param configDir - Config directory path for GlobalSkillConfigStore
   * @returns Effective skills with source tracking
   */
  async computeEffectiveSkills(assistantConfig: AssistantSkillConfig, configDir: string): Promise<EffectiveSkills> {
    const repo = SkillRepository.getInstance();
    const store = GlobalSkillConfigStore.getInstance(configDir);
    const allEntries = repo.list({ status: 'healthy' });

    const blockedSet = new Set(assistantConfig.blocked);
    const addedSet = new Set(assistantConfig.added);
    const isSelectiveMode = addedSet.size > 0;

    const skills: SkillEntry[] = [];
    const sources: EffectiveSkills['sources'] = {};

    for (const entry of allEntries) {
      // Always exclude blocked skills
      if (blockedSet.has(entry.name)) {
        sources[entry.name] = {
          source: entry.source,
          grantedBy: 'assistant',
          blockedReason: 'Explicitly blocked by assistant config',
        };
        continue;
      }

      if (isSelectiveMode) {
        // Precise selection mode: only include skills listed in `added`
        if (addedSet.has(entry.name)) {
          skills.push(entry);
          sources[entry.name] = {
            source: entry.source,
            grantedBy: 'assistant',
          };
        }
      } else {
        // Inherit mode: include all globally enabled skills
        const isEnabled = await store.isEnabled(entry.name, entry.source);
        if (isEnabled) {
          skills.push(entry);
          sources[entry.name] = {
            source: entry.source,
            grantedBy: 'global',
          };
        }
      }
    }

    return { skills, sources };
  }

  // ---------------------------------------------------------------------------
  // Pathway 1: Content Injection (Gemini)
  // ---------------------------------------------------------------------------

  /**
   * Build full skill content for system instruction injection.
   *
   * Loads and concatenates the full SKILL.md content for each effective skill.
   * Results are cached to avoid repeated filesystem reads within the same session.
   *
   * @param effective - Computed effective skills
   * @param presetContext - Optional preset context/rules to prepend
   * @returns System instructions string, or undefined if no content
   */
  async buildContentInjection(effective: EffectiveSkills, presetContext?: string): Promise<string | undefined> {
    const parts: string[] = [];

    if (presetContext) {
      parts.push(presetContext);
    }

    if (effective.skills.length > 0) {
      const skillContents: string[] = [];
      for (const entry of effective.skills) {
        const content = await this.loadSkillContent(entry);
        if (content) {
          skillContents.push(`## Skill: ${entry.name}\n${content}`);
        }
      }

      if (skillContents.length > 0) {
        parts.push(`[Available Skills]\n${skillContents.join('\n\n')}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  // ---------------------------------------------------------------------------
  // Pathway 2: Index Injection (Claude/Codex)
  // ---------------------------------------------------------------------------

  /**
   * Build skill index text for first-message injection.
   *
   * Produces a lightweight index (name + description) that agents use to
   * discover available skills. Agents then request full content via
   * `[LOAD_SKILL: name]` or by reading the SKILL.md file directly.
   *
   * @param effective - Computed effective skills
   * @param skillsDir - Base skills directory path
   * @param builtinSkillsDir - Builtin skills directory path
   * @returns Index text with location hints, or empty string if no skills
   */
  buildIndexInjection(effective: EffectiveSkills, skillsDir: string, builtinSkillsDir: string): string {
    if (effective.skills.length === 0) return '';

    const index: SkillIndexItem[] = effective.skills.map((e) => ({
      name: e.name,
      description: e.metadata.description,
    }));

    const lines = index.map((s) => `- ${s.name}: ${s.description}`);

    return `[Available Skills]
The following skills are available. When you need detailed instructions for a specific skill,
you can request it by outputting: [LOAD_SKILL: skill-name]

${lines.join('\n')}

[Skills Location]
Skills are stored in two locations:
- Builtin skills (auto-enabled): ${builtinSkillsDir}/{skill-name}/SKILL.md
- Optional skills: ${skillsDir}/{skill-name}/SKILL.md

Each skill has a SKILL.md file containing detailed instructions.
To use a skill, read its SKILL.md file when needed.

For example:
- Builtin "cron" skill: ${builtinSkillsDir}/cron/SKILL.md
- Optional "pptx" skill: ${skillsDir}/pptx/SKILL.md`;
  }

  /**
   * Prepare the first message with skill index injection.
   *
   * Wraps the user message with preset rules and skill index for Claude/Codex agents.
   *
   * @param content - Original user message content
   * @param effective - Computed effective skills
   * @param skillsDir - Base skills directory path
   * @param builtinSkillsDir - Builtin skills directory path
   * @param presetContext - Optional preset rules
   * @returns Message content with injected instructions
   */
  prepareFirstMessageWithIndex(
    content: string,
    effective: EffectiveSkills,
    skillsDir: string,
    builtinSkillsDir: string,
    presetContext?: string
  ): string {
    const instructions: string[] = [];

    if (presetContext) {
      instructions.push(presetContext);
    }

    const indexText = this.buildIndexInjection(effective, skillsDir, builtinSkillsDir);
    if (indexText) {
      instructions.push(indexText);
    }

    if (instructions.length === 0) {
      return content;
    }

    const systemInstructions = instructions.join('\n\n');
    return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
  }

  // ---------------------------------------------------------------------------
  // Pathway 3: Workspace Symlink (CLI-native)
  // ---------------------------------------------------------------------------

  /**
   * Set up skill symlinks in a CLI-native workspace directory.
   *
   * Creates symlinks from the workspace's CLI skills directory to the actual
   * skill directories, enabling the CLI's native SkillManager to discover them.
   *
   * Only runs for temporary workspaces (not user-specified) to avoid polluting
   * user project directories.
   *
   * @param workspace - Workspace root directory
   * @param effective - Computed effective skills
   * @param userSkillsDir - Source skills directory containing actual skill folders
   * @param options - Agent type/backend for determining target directory
   */
  async setupWorkspaceSymlinks(
    workspace: string,
    effective: EffectiveSkills,
    userSkillsDir: string,
    options: {
      agentType?: string;
      backend?: string;
    }
  ): Promise<void> {
    if (effective.skills.length === 0) return;

    const key = options.backend ?? options.agentType ?? '';
    const skillsDirs = AGENT_SKILLS_DIRS[key] ?? DEFAULT_SKILLS_DIRS;

    for (const skillsRelDir of skillsDirs) {
      const targetSkillsDir = path.join(workspace, skillsRelDir);
      await fs.mkdir(targetSkillsDir, { recursive: true });

      for (const entry of effective.skills) {
        // Symlink the skill's parent directory (not the SKILL.md file itself)
        const sourceSkillDir = path.dirname(entry.path);
        const targetSkillDir = path.join(targetSkillsDir, entry.name);

        try {
          await fs.stat(sourceSkillDir);
          try {
            await fs.lstat(targetSkillDir);
            // Already exists, skip
          } catch {
            await fs.symlink(sourceSkillDir, targetSkillDir, 'dir');
          }
        } catch {
          console.warn(`[SkillInjector] Skill directory not found: ${sourceSkillDir}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // On-demand skill loading (for [LOAD_SKILL: name] requests)
  // ---------------------------------------------------------------------------

  /**
   * Load full content for requested skills (on-demand).
   *
   * Used when an agent outputs `[LOAD_SKILL: skill-name]` and the system
   * needs to send back the full skill content.
   *
   * @param names - Skill names to load
   * @returns Formatted skill content text
   */
  async loadSkillsOnDemand(names: string[]): Promise<string> {
    const repo = SkillRepository.getInstance();
    const loaded: Array<{ name: string; body: string }> = [];

    for (const name of names) {
      const entry = repo.get(name);
      if (!entry) continue;

      const content = await this.loadSkillContent(entry);
      if (content) {
        loaded.push({ name: entry.name, body: content });
      }
    }

    if (loaded.length === 0) return '';
    return loaded.map((s) => `[Skill: ${s.name}]\n${s.body}`).join('\n\n');
  }

  /**
   * Get the list of effective skill names for a given assistant config.
   *
   * Convenience method for agent managers that need to pass skill names
   * to worker processes (e.g., Gemini worker's `enabledSkills` array).
   *
   * @param effective - Computed effective skills
   * @returns Array of skill names
   */
  getEffectiveSkillNames(effective: EffectiveSkills): string[] {
    return effective.skills.map((e) => e.name);
  }

  // ---------------------------------------------------------------------------
  // Cache management
  // ---------------------------------------------------------------------------

  /**
   * Clear the content cache.
   * Call when skill files are updated or on conversation reset.
   */
  clearCache(): void {
    this.contentCache.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Load and cache the full content of a single skill file.
   * Strips YAML frontmatter, returning only the body.
   */
  private async loadSkillContent(entry: SkillEntry): Promise<string | null> {
    const cached = this.contentCache.get(entry.name);
    if (cached !== undefined) return cached;

    if (!existsSync(entry.path)) {
      return null;
    }

    try {
      const raw = await fs.readFile(entry.path, 'utf-8');
      const body = extractBody(raw);
      if (body) {
        this.contentCache.set(entry.name, body);
      }
      return body || null;
    } catch (err) {
      console.warn(`[SkillInjector] Failed to load skill content for "${entry.name}":`, err);
      return null;
    }
  }
}

/**
 * Remove YAML frontmatter from SKILL.md content, returning only the body.
 */
function extractBody(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}
