/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeRepo, EffectiveInstructionResult, TeammateCapabilityCard } from '@/common/types/knowledgeRepo';

const DEFAULT_TOKEN_BUDGET = 8000; // max budget for injected knowledge repo content

export class KnowledgeRepoPromptBuilder {
  /**
   * Build the injected instruction block per teammate with strict precedence:
   * (1) AionUi safety and permission settings
   * (2) User direct instructions in chat (placeholder marker)
   * (3) Teammate's own role prompt
   * (4) Repo rules in priority order (higher-priority repo wins conflicts)
   */
  buildInstructions(params: {
    memberName: string;
    rolePrompt?: string;
    repos: KnowledgeRepo[];
    whenToUseHint?: string;
    tokenBudget?: number;
  }): EffectiveInstructionResult {
    const { memberName, rolePrompt = '', repos, whenToUseHint, tokenBudget = DEFAULT_TOKEN_BUDGET } = params;

    const conflicts: Array<{ ruleA: string; ruleB: string; resolvedInFavorOf: string }> = [];
    const seenRuleNames = new Map<string, string>(); // name -> repoId

    // 1. Authoritative Playbook Preamble
    const hintText = whenToUseHint ? `for ${whenToUseHint}` : 'for tasks assigned to you';
    const preamble = [
      `### Authoritative Knowledge Playbook for ${memberName}`,
      `You are operating with these repositories as your authoritative playbook ${hintText}. Follow their documented pipelines and rules step by step. Do not invent a different workflow. If a step cannot be performed, say so and ask the user instead of improvising.`,
      '',
    ].join('\n');

    // 2. Teammate Role Prompt Section
    const roleSection = rolePrompt.trim() ? `### Teammate Role\n${rolePrompt.trim()}\n\n` : '';

    // 3. Collect Always-On Rules from Repos in Priority Order
    const ruleBlocks: string[] = [];
    let estimatedTokens = Math.ceil((preamble.length + roleSection.length) / 4);
    let budgetExceeded = false;

    for (const repo of repos) {
      if (!repo.manifest || repo.trustStatus === 'untrusted') continue;

      const repoHeader = `#### Rules from Repository: ${repo.name} (ref: ${repo.ref})`;
      const repoRulesText: string[] = [repoHeader];

      for (const rule of repo.manifest.alwaysOnRules) {
        if (seenRuleNames.has(rule.name)) {
          const priorRepo = seenRuleNames.get(rule.name)!;
          conflicts.push({
            ruleA: `${priorRepo}:${rule.name}`,
            ruleB: `${repo.name}:${rule.name}`,
            resolvedInFavorOf: `${priorRepo}:${rule.name}`,
          });
          continue; // Prior repo wins
        }
        seenRuleNames.set(rule.name, repo.name);

        const ruleText = `<!-- Rule: ${rule.relativePath} -->\n${rule.content}\n`;
        const ruleTokens = Math.ceil(ruleText.length / 4);

        if (estimatedTokens + ruleTokens > tokenBudget) {
          budgetExceeded = true;
          const remainingTokens = Math.max(0, tokenBudget - estimatedTokens);
          const remainingChars = remainingTokens * 4;
          if (remainingChars > 100) {
            repoRulesText.push(
              `${ruleText.slice(0, remainingChars)}\n\n[TRUNCATED: Knowledge rule budget limit of ${tokenBudget} tokens reached]`
            );
          }
          break;
        } else {
          estimatedTokens += ruleTokens;
          repoRulesText.push(ruleText);
        }
      }

      if (repoRulesText.length > 1) {
        ruleBlocks.push(repoRulesText.join('\n'));
      }

      if (budgetExceeded) break;
    }

    // 4. On-Demand Skills Index (Progressive Disclosure)
    const skillIndexBlocks: string[] = [];
    for (const repo of repos) {
      if (!repo.manifest?.onDemandSkills?.length) continue;
      const skillsLines = repo.manifest.onDemandSkills.map(
        (s) => `- \`${repo.name}/${s.name}\`: ${s.description} (File: ${s.relativePath})`
      );
      skillIndexBlocks.push(`#### Available On-Demand Skills & Pipelines (${repo.name}):\n${skillsLines.join('\n')}`);
    }

    const onDemandSection =
      skillIndexBlocks.length > 0
        ? `### Available Skills & Pipelines (Read full files only when relevant):\n${skillIndexBlocks.join('\n\n')}\n\n`
        : '';

    const instructions = [
      preamble,
      roleSection,
      ruleBlocks.length > 0 ? `### Active Repository Rules:\n${ruleBlocks.join('\n\n')}\n\n` : '',
      onDemandSection,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      instructions: instructions.trim(),
      estimatedTokens: Math.ceil(instructions.length / 4),
      budgetExceeded,
      budgetLimitTokens: tokenBudget,
      conflicts,
    };
  }

  /**
   * Build short capability cards for the team lead so it routes tasks accurately.
   */
  buildCapabilityCard(params: {
    memberSlotId: string;
    memberName: string;
    repos: KnowledgeRepo[];
    whenToUseHint?: string;
  }): TeammateCapabilityCard {
    const { memberSlotId, memberName, repos, whenToUseHint } = params;
    return {
      memberSlotId,
      memberName,
      repos: repos.map((r) => ({
        repoId: r.id,
        repoName: r.name,
        whenToUseHint,
        keySkills: (r.manifest?.onDemandSkills || []).map((s) => s.name).slice(0, 10),
      })),
    };
  }
}

export const knowledgeRepoPromptBuilder = new KnowledgeRepoPromptBuilder();
