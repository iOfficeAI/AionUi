/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RalphPrd, RalphUserStory } from './types';
import { RALPH_COMPLETION_SIGNAL } from './types';
import { getNextStory, getCompletionStats } from './PrdParser';

/**
 * Build the iteration prompt sent to Claude Code for each autonomous loop cycle.
 * This is the core of Ralph - it gives Claude Code all the context needed to work
 * on the next user story autonomously.
 */
export function buildIterationPrompt(prd: RalphPrd, progressContent: string, agentsContent: string, iteration: number, maxIterations: number): string {
  const nextStory = getNextStory(prd);
  const stats = getCompletionStats(prd);

  if (!nextStory) {
    return buildCompletionCheckPrompt(prd, progressContent);
  }

  const sections: string[] = [];

  // Header
  sections.push(`# Ralph Autonomous Agent - Iteration ${iteration}/${maxIterations}`);
  sections.push('');

  // Project context
  sections.push('## Project Context');
  sections.push(`- **Project:** ${prd.project}`);
  sections.push(`- **Branch:** ${prd.branchName}`);
  sections.push(`- **Description:** ${prd.description}`);
  sections.push(`- **Progress:** ${stats.completed}/${stats.total} stories complete (${stats.percentage}%)`);
  sections.push('');

  // Current task
  sections.push('## Current Task');
  sections.push(formatStoryForPrompt(nextStory));
  sections.push('');

  // Instructions
  sections.push(buildInstructionsSection());
  sections.push('');

  // PRD overview (remaining stories)
  sections.push('## Remaining Stories');
  const remaining = prd.userStories.filter((s) => !s.passes).sort((a, b) => a.priority - b.priority);
  for (const story of remaining) {
    const isCurrent = story.id === nextStory.id;
    sections.push(`- ${isCurrent ? '**[CURRENT]** ' : ''}${story.id}: ${story.title} (priority: ${story.priority})`);
  }
  sections.push('');

  // Completed stories
  const completed = prd.userStories.filter((s) => s.passes);
  if (completed.length > 0) {
    sections.push('## Completed Stories');
    for (const story of completed) {
      sections.push(`- ${story.id}: ${story.title}${story.notes ? ` (${story.notes})` : ''}`);
    }
    sections.push('');
  }

  // Previous progress (accumulated learnings)
  if (progressContent.trim()) {
    sections.push('## Previous Progress');
    sections.push(progressContent);
    sections.push('');
  }

  // Accumulated learnings from AGENTS.md
  if (agentsContent.trim()) {
    sections.push('## Accumulated Learnings');
    sections.push(agentsContent);
    sections.push('');
  }

  // Completion signal instructions
  sections.push(buildCompletionSignalSection(stats.remaining));

  return sections.join('\n');
}

/**
 * Format a user story for inclusion in the prompt.
 */
function formatStoryForPrompt(story: RalphUserStory): string {
  const lines: string[] = [];
  lines.push(`### ${story.id}: ${story.title}`);
  lines.push('');
  lines.push(`**Description:** ${story.description}`);
  lines.push('');
  lines.push('**Acceptance Criteria:**');
  for (const criterion of story.acceptanceCriteria) {
    lines.push(`- [ ] ${criterion}`);
  }
  if (story.notes) {
    lines.push('');
    lines.push(`**Notes:** ${story.notes}`);
  }
  return lines.join('\n');
}

/**
 * Build the instructions section of the prompt.
 */
function buildInstructionsSection(): string {
  return `## Instructions

You are an autonomous coding agent working through a structured PRD. Follow these steps precisely:

### Step 1: Verify Environment
- Confirm you are on the correct git branch (see Project Context above)
- If not, switch to it: \`git checkout <branchName>\`

### Step 2: Implement the Current Story
- Focus ONLY on the current task listed above
- Implement all acceptance criteria
- Keep changes minimal and focused on this single story
- If you cannot describe the change in 2-3 sentences, the story may be too large

### Step 3: Quality Checks
- Run the project's type checker (if applicable)
- Run the linter (if applicable)
- Run tests (if applicable)
- Fix any failures before proceeding

### Step 4: Commit
- Stage your changes
- Commit with format: \`feat: [Story ID] - [Story Title]\`
- Example: \`feat: US-001 - Add user authentication\`

### Step 5: Report Results
- Describe what you implemented
- List files changed
- Note any learnings or patterns discovered
- Note any issues encountered

### Important Rules
- Do NOT work on multiple stories in one iteration
- Do NOT skip quality checks
- Do NOT leave failing tests
- If you get stuck, document the issue and move on
- Write genuinely useful learnings, not boilerplate`;
}

/**
 * Build the completion signal section.
 */
function buildCompletionSignalSection(remainingCount: number): string {
  if (remainingCount <= 1) {
    return `## Completion Signal

This is the LAST remaining story. After completing it successfully AND all quality checks pass, output the following signal on its own line:

${RALPH_COMPLETION_SIGNAL}

This signals the orchestrator that all stories are complete.`;
  }

  return `## Completion Signal

There are ${remainingCount} stories remaining (including the current one). After completing the current story, do NOT output the completion signal. The orchestrator will start a new iteration for the next story.

Only output \`${RALPH_COMPLETION_SIGNAL}\` when ALL stories in the PRD have been completed.`;
}

/**
 * Build a prompt for checking completion when no stories remain.
 */
function buildCompletionCheckPrompt(prd: RalphPrd, progressContent: string): string {
  const sections: string[] = [];

  sections.push('# Ralph - All Stories Complete');
  sections.push('');
  sections.push(`All ${prd.userStories.length} user stories have been marked as complete.`);
  sections.push('');
  sections.push('## Final Verification');
  sections.push('Please perform a final verification:');
  sections.push('1. Run all quality checks (typecheck, lint, tests)');
  sections.push('2. Verify the git history shows all story commits');
  sections.push('3. Confirm everything is working correctly');
  sections.push('');

  if (progressContent.trim()) {
    sections.push('## Progress Log');
    sections.push(progressContent);
    sections.push('');
  }

  sections.push(`After verification, output: ${RALPH_COMPLETION_SIGNAL}`);

  return sections.join('\n');
}

/**
 * Build the initial prompt for when a user provides a feature description
 * and needs a PRD generated.
 */
export function buildPrdGenerationPrompt(featureDescription: string, projectName: string): string {
  return `# Generate PRD for Ralph

You are a product manager creating a structured PRD for autonomous implementation.

## Feature Request
${featureDescription}

## Project
${projectName}

## Instructions

Create a \`prd.json\` file with the following structure:

\`\`\`json
{
  "project": "${projectName}",
  "branchName": "ralph/<feature-kebab-case>",
  "description": "<concise feature description>",
  "userStories": [
    {
      "id": "US-001",
      "title": "<brief title>",
      "description": "As a <user>, I want <goal> so that <benefit>",
      "acceptanceCriteria": [
        "<concrete, testable criterion 1>",
        "<concrete, testable criterion 2>"
      ],
      "priority": 1,
      "passes": false
    }
  ]
}
\`\`\`

## Story Sizing Rules
- Each story must be completable in ONE context window
- If you cannot describe the change in 2-3 sentences, it is too big - split it
- Order by dependency: data/models first, then logic, then UI
- Each acceptance criterion must be concretely testable

## Branch Naming
- Use \`ralph/\` prefix with kebab-case: \`ralph/add-user-auth\`

Save the file as \`prd.json\` in the workspace root.`;
}
