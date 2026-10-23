/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeRepo, KnowledgeRepoWhatChanged } from '@/common/types/knowledgeRepo';

const SENSITIVE_SETUP_PATTERNS = [
  /^Makefile$/i,
  /^setup\.(sh|bash|py)$/i,
  /^requirements.*\.txt$/i,
  /^package\.json$/i,
  /^Pipfile(\.lock)?$/i,
  /^pyproject\.toml$/i,
  /^\.env\.example$/i,
];

export class KnowledgeRepoDiffGenerator {
  /**
   * Compare old and new repository manifests to compute what changed,
   * commit logs, and detect whether execution/setup re-approval is required.
   */
  generateWhatChanged(
    oldRepo: KnowledgeRepo,
    newCommitSha: string,
    commitMessages: string[],
    newManifest: KnowledgeRepo['manifest']
  ): KnowledgeRepoWhatChanged {
    const oldRules = new Map(oldRepo.manifest.alwaysOnRules.map((r) => [r.relativePath, r]));
    const newRules = new Map(newManifest.alwaysOnRules.map((r) => [r.relativePath, r]));

    const addedRules: string[] = [];
    const removedRules: string[] = [];
    const modifiedRules: string[] = [];

    for (const [relPath, newRule] of newRules.entries()) {
      const oldRule = oldRules.get(relPath);
      if (!oldRule) {
        addedRules.push(relPath);
      } else if (oldRule.content !== newRule.content) {
        modifiedRules.push(relPath);
      }
    }
    for (const relPath of oldRules.keys()) {
      if (!newRules.has(relPath)) {
        removedRules.push(relPath);
      }
    }

    const oldSkills = new Map(oldRepo.manifest.onDemandSkills.map((s) => [s.relativePath, s]));
    const newSkills = new Map(newManifest.onDemandSkills.map((s) => [s.relativePath, s]));

    const addedSkills: string[] = [];
    const removedSkills: string[] = [];
    const modifiedSkills: string[] = [];

    for (const [relPath, newSkill] of newSkills.entries()) {
      const oldSkill = oldSkills.get(relPath);
      if (!oldSkill) {
        addedSkills.push(relPath);
      } else if (oldSkill.name !== newSkill.name || oldSkill.description !== newSkill.description) {
        modifiedSkills.push(relPath);
      }
    }
    for (const relPath of oldSkills.keys()) {
      if (!newSkills.has(relPath)) {
        removedSkills.push(relPath);
      }
    }

    // Check setup & executable files changes
    const oldSetupFiles = new Set(oldRepo.manifest.setupFiles.map((f) => f.relativePath));
    const newSetupFiles = new Set(newManifest.setupFiles.map((f) => f.relativePath));
    const setupFilesChanged: string[] = [];

    for (const sf of newSetupFiles) {
      if (!oldSetupFiles.has(sf)) {
        setupFilesChanged.push(`+ ${sf}`);
      }
    }
    for (const sf of oldSetupFiles) {
      if (!newSetupFiles.has(sf)) {
        setupFilesChanged.push(`- ${sf}`);
      }
    }

    // Check if any rule or setup file is a sensitive script or manifest
    let requiresReapproval = setupFilesChanged.length > 0;
    if (!requiresReapproval) {
      // Check modified rules for setup/build/script patterns
      for (const rel of [...addedRules, ...modifiedRules]) {
        for (const pattern of SENSITIVE_SETUP_PATTERNS) {
          if (pattern.test(rel)) {
            requiresReapproval = true;
            setupFilesChanged.push(`~ ${rel}`);
            break;
          }
        }
      }
    }

    return {
      previousCommitSha: oldRepo.currentCommitSha || '',
      newCommitSha,
      commitMessages,
      addedRules,
      removedRules,
      modifiedRules,
      addedSkills,
      removedSkills,
      modifiedSkills,
      setupFilesChanged,
      requiresReapproval,
      updatedAt: Date.now(),
    };
  }
}

export const knowledgeRepoDiffGenerator = new KnowledgeRepoDiffGenerator();
