/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitHubIssue } from '@/common/adapter/ipcBridge';

/**
 * Builds an actionable fix prompt for an AI agent based on a GitHub Issue.
 */
export function buildIssueFixPrompt(issue: GitHubIssue, repoName?: string): string {
  const repoPrefix = repoName ? ` in ${repoName}` : '';
  const labelsText = issue.labels && issue.labels.length > 0 ? issue.labels.map((l) => l.name).join(', ') : '';

  let prompt = `Please analyze and fix GitHub Issue #${issue.number}${repoPrefix}: "${issue.title}".\n\n`;

  if (issue.body && issue.body.trim()) {
    prompt += `### Issue Description:\n${issue.body.trim()}\n\n`;
  } else {
    prompt += `### Issue Description:\n(No description provided in the issue)\n\n`;
  }

  if (labelsText) {
    prompt += `**Labels**: ${labelsText}\n`;
  }
  if (issue.htmlUrl) {
    prompt += `**GitHub URL**: ${issue.htmlUrl}\n\n`;
  }

  prompt += `Please inspect the codebase, identify the root cause, explain the planned solution, and implement the necessary changes.`;

  return prompt;
}
