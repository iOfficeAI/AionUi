/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import type {
  KnowledgeRepoManifest,
  KnowledgeRuleItem,
  KnowledgeSkillItem,
  KnowledgeSetupFile,
} from '@/common/types/knowledgeRepo';

const MAX_RULE_FILE_SIZE = 128 * 1024; // 128 KB max per always-on rule file

// Common rule filename patterns
const ALWAYS_ON_RULE_FILES = [
  'AGENTS.md',
  'AGENT_GUIDE.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];

// Folders containing rule files
const RULE_DIRECTORIES = ['.cursor/rules'];

// Skill directory search roots
const SKILL_DIRECTORIES = ['.claude/skills', 'skills', '.agents', '.agent'];

// Workflows / pipelines directories
const WORKFLOW_DIRECTORIES = ['pipelines', 'pipeline_defs', 'workflows', 'docs'];

// Setup and environment files that may alter runtime or execute code
const SETUP_FILE_PATTERNS: Array<{
  pattern: RegExp;
  type: KnowledgeSetupFile['type'];
  defaultBinaries?: string[];
}> = [
  { pattern: /^Makefile$/i, type: 'makefile', defaultBinaries: ['make'] },
  { pattern: /^setup\.(sh|bash|py)$/i, type: 'script' },
  { pattern: /^requirements.*\.txt$/i, type: 'dependency', defaultBinaries: ['python', 'pip'] },
  { pattern: /^package\.json$/i, type: 'dependency', defaultBinaries: ['node', 'npm'] },
  { pattern: /^Pipfile(\.lock)?$/i, type: 'dependency', defaultBinaries: ['pipenv'] },
  { pattern: /^pyproject\.toml$/i, type: 'dependency', defaultBinaries: ['python'] },
  { pattern: /^\.env\.example$/i, type: 'env_example' },
];

export class KnowledgeRepoScanner {
  /**
   * Scans a repository directory (or subpath) and builds a KnowledgeRepoManifest.
   */
  async scan(baseDir: string, subpath?: string): Promise<KnowledgeRepoManifest> {
    const root = subpath ? path.join(baseDir, subpath) : baseDir;

    const alwaysOnRules: KnowledgeRuleItem[] = [];
    const onDemandSkills: KnowledgeSkillItem[] = [];
    const setupFiles: KnowledgeSetupFile[] = [];
    const envExampleVars: string[] = [];

    // 1. Scan always-on instruction files in root
    for (const ruleRel of ALWAYS_ON_RULE_FILES) {
      const fullPath = path.join(root, ruleRel);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          const rawContent = await fs.readFile(fullPath, 'utf8');
          const sizeBytes = stat.size;
          const content =
            sizeBytes > MAX_RULE_FILE_SIZE
              ? `${rawContent.slice(0, MAX_RULE_FILE_SIZE)}\n\n[TRUNCATED: Rule file exceeded budget]`
              : rawContent;

          alwaysOnRules.push({
            id: ruleRel.replace(/[^a-zA-Z0-9_-]/g, '_'),
            name: path.basename(ruleRel),
            relativePath: ruleRel,
            content,
            sizeBytes,
            priority: 10,
          });
        }
      } catch {
        // File does not exist, ignore
      }
    }

    // 2. Scan rule directories (e.g. .cursor/rules/*)
    for (const dirRel of RULE_DIRECTORIES) {
      const fullDir = path.join(root, dirRel);
      try {
        const entries = await fs.readdir(fullDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const relPath = path.join(dirRel, entry.name).replace(/\\/g, '/');
            const fullPath = path.join(fullDir, entry.name);
            const stat = await fs.stat(fullPath);
            const rawContent = await fs.readFile(fullPath, 'utf8');
            alwaysOnRules.push({
              id: relPath.replace(/[^a-zA-Z0-9_-]/g, '_'),
              name: entry.name,
              relativePath: relPath,
              content: rawContent,
              sizeBytes: stat.size,
              priority: 5,
            });
          }
        }
      } catch {
        // Directory does not exist
      }
    }

    // 3. Scan on-demand skills
    for (const skillDirRel of SKILL_DIRECTORIES) {
      const fullSkillDir = path.join(root, skillDirRel);
      try {
        const entries = await fs.readdir(fullSkillDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillMdPath = path.join(fullSkillDir, entry.name, 'SKILL.md');
            try {
              const content = await fs.readFile(skillMdPath, 'utf8');
              const { name, description } = this.parseSkillFrontmatter(content, entry.name);
              onDemandSkills.push({
                id: `${skillDirRel}_${entry.name}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
                name,
                description,
                relativePath: path.join(skillDirRel, entry.name, 'SKILL.md').replace(/\\/g, '/'),
                category: skillDirRel,
              });
            } catch {
              // No SKILL.md found in folder
            }
          }
        }
      } catch {
        // Directory does not exist
      }
    }

    // 4. Scan workflow / pipeline directories
    for (const wfDir of WORKFLOW_DIRECTORIES) {
      const fullWfDir = path.join(root, wfDir);
      try {
        const entries = await fs.readdir(fullWfDir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.isFile() &&
            (entry.name.endsWith('.md') || entry.name.endsWith('.yaml') || entry.name.endsWith('.json'))
          ) {
            const relPath = path.join(wfDir, entry.name).replace(/\\/g, '/');
            onDemandSkills.push({
              id: relPath.replace(/[^a-zA-Z0-9_-]/g, '_'),
              name: entry.name,
              description: `Workflow definition in ${relPath}`,
              relativePath: relPath,
              category: wfDir,
            });
          }
        }
      } catch {
        // Directory does not exist
      }
    }

    // 5. Fallback: If no rules or skills found, check README.md
    if (alwaysOnRules.length === 0 && onDemandSkills.length === 0) {
      const readmePath = path.join(root, 'README.md');
      try {
        const stat = await fs.stat(readmePath);
        if (stat.isFile()) {
          const raw = await fs.readFile(readmePath, 'utf8');
          alwaysOnRules.push({
            id: 'readme_fallback',
            name: 'README.md',
            relativePath: 'README.md',
            content: raw.slice(0, 4000), // Bounded excerpt
            sizeBytes: Math.min(stat.size, 4000),
            priority: 1,
          });
        }
      } catch {
        // No README
      }
    }

    // 6. Detect setup files & scripts
    try {
      const rootEntries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (!entry.isFile()) continue;
        for (const match of SETUP_FILE_PATTERNS) {
          if (match.pattern.test(entry.name)) {
            const relPath = entry.name;
            const setupItem: KnowledgeSetupFile = {
              relativePath: relPath,
              type: match.type,
              requiredBinaries: match.defaultBinaries,
            };

            if (entry.name === '.env.example') {
              try {
                const envContent = await fs.readFile(path.join(root, entry.name), 'utf8');
                const vars = envContent
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line && !line.startsWith('#') && line.includes('='))
                  .map((line) => line.split('=')[0].trim());
                envExampleVars.push(...vars);
              } catch {
                // Ignore .env.example read errors
              }
            }

            setupFiles.push(setupItem);
          }
        }
      }
    } catch {
      // Ignore root entry scan failure
    }

    // Calculate approximate token estimate (1 token ~= 4 chars)
    let totalChars = 0;
    for (const rule of alwaysOnRules) {
      totalChars += rule.content.length;
    }
    for (const skill of onDemandSkills) {
      totalChars += skill.name.length + skill.description.length + skill.relativePath.length;
    }
    const estimatedTokens = Math.ceil(totalChars / 4);

    return {
      alwaysOnRules,
      onDemandSkills,
      setupFiles,
      envExampleVars: Array.from(new Set(envExampleVars)),
      summary: `Discovered ${alwaysOnRules.length} rules, ${onDemandSkills.length} skills/workflows, ${setupFiles.length} setup files.`,
      estimatedTokens,
    };
  }

  /**
   * Parse frontmatter from SKILL.md
   */
  private parseSkillFrontmatter(content: string, defaultName: string): { name: string; description: string } {
    let name = defaultName;
    let description = `Skill defined in ${defaultName}`;

    if (content.startsWith('---')) {
      const parts = content.split('---');
      if (parts.length >= 3) {
        const fm = parts[1];
        const lines = fm.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('name:')) {
            name = trimmed
              .replace('name:', '')
              .trim()
              .replace(/^['"]|['"]$/g, '');
          } else if (trimmed.startsWith('description:')) {
            description = trimmed
              .replace('description:', '')
              .trim()
              .replace(/^['"]|['"]$/g, '');
          }
        }
      }
    }
    return { name, description };
  }
}

export const knowledgeRepoScanner = new KnowledgeRepoScanner();
