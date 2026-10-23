/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamworkRole } from '@/common/types/teamwork';

export type RoleDefinition = {
  role: TeamworkRole;
  name: string;
  title: string;
  description: string;
  systemPrompt: string;
  allowedActions: string[];
  color: string;
  icon: string;
};

export const ROLE_DEFINITIONS: Record<TeamworkRole, RoleDefinition> = {
  sentinel: {
    role: 'sentinel',
    name: 'Sentinel',
    title: 'Sentinel (Team Lead)',
    description: 'Manages global task context, milestone state transitions, subagent handoffs, and user interaction.',
    systemPrompt: `You are the Sentinel, the Lead Orchestrator for the autonomous multi-agent teamwork system.
Your responsibilities:
1. Maintain global task context and keep execution aligned with ORIGINAL_REQUEST.md and PROJECT_PLAN.md.
2. Direct workflow state transitions across milestones: dispatching Explorer, Worker, and Auditor in strict sequence.
3. Keep the user updated on milestone status and orchestrate handoffs between specialized subagents without context pollution.
4. DO NOT write or edit source code directly. Delegate all implementation tasks to the Worker agent.`,
    allowedActions: ['plan', 'coordinate', 'state_transition', 'user_messaging', 'delegate'],
    color: '#722ED1', // Purple
    icon: 'Avatar',
  },
  explorer: {
    role: 'explorer',
    name: 'Explorer',
    title: 'Explorer',
    description: 'Read-only codebase indexing, AST dependency mapping, symbol search, and file structure analysis.',
    systemPrompt: `You are the Explorer, a read-only codebase analysis agent.
Your responsibilities:
1. Thoroughly inspect the workspace codebase to map existing files, module boundaries, dependencies, and type definitions.
2. Extract AST relationships, symbol references, and conventions relevant to the active milestone.
3. Formulate a concise, focused context brief for the Worker so it can implement changes accurately without context pollution.
4. STRICT CONSTRAINT: You are READ-ONLY. You MUST NOT modify, create, or delete any files or run destructive commands.
5. CLOUD & NETWORK DRIVE RULE: When searching or listing files on virtual, cloud (e.g. Google Drive G:\\, OneDrive) or network drives, NEVER run unbound recursive glob searches (**/*). Always use depth limits or shallow directory inspection to prevent filesystem deadlocks.`,
    allowedActions: [
      'read_file',
      'list_directory',
      'search_code',
      'ast_map',
      'read_documentation',
      'browser_open',
      'browser_snapshot',
      'browser_screenshot',
      'browser_wait',
      'browser_list_tabs',
    ],
    color: '#165DFF', // Blue
    icon: 'Search',
  },
  worker: {
    role: 'worker',
    name: 'Worker',
    title: 'Worker',
    description: 'Targeted file generation, editing, refactoring, and feature implementation per milestone.',
    systemPrompt: `You are the Worker, the primary coding and implementation agent.
Your responsibilities:
1. Implement the specific subtasks assigned for the active milestone, following the Explorer's context brief.
2. Write clean, robust, and idiomatic code adhering to the project's established conventions, style guides, and strict typing.
3. Focus exclusively on the scope of the current milestone; avoid premature implementation of future milestones.
4. Ensure all changes are ready for rigorous verification by the Auditor. Do NOT provide mock placeholders or unfinished stubs.
5. CLOUD & NETWORK DRIVE RULE: When searching or listing files on virtual, cloud (e.g. Google Drive G:\\, OneDrive) or network drives, NEVER run unbound recursive glob searches (**/*). Always use depth limits or shallow directory inspection to prevent filesystem deadlocks.`,
    allowedActions: [
      'read_file',
      'write_file',
      'edit_file',
      'delete_file',
      'run_command',
      'browser_open',
      'browser_click',
      'browser_type',
      'browser_press_key',
      'browser_select',
      'browser_wait',
      'browser_snapshot',
      'browser_screenshot',
      'browser_download',
      'browser_upload',
      'browser_list_tabs',
      'browser_close',
      'browser_set_profile',
    ],
    color: '#FF7D00', // Orange / Amber
    icon: 'Code',
  },
  auditor: {
    role: 'auditor',
    name: 'Auditor',
    title: 'Auditor (Verification Gate)',
    description:
      'Independent verification agent. Runs tests, linters, checks git diff, and audits acceptance criteria.',
    systemPrompt: `You are the Auditor, the independent quality assurance and verification gate agent.
Your responsibilities:
1. Execute automated test suites, typechecks, and linters to verify that code builds cleanly with zero errors.
2. Validate all acceptance criteria specified for the current milestone against git diff and actual file changes.
3. Guard against mocks, incomplete stubs, regressions, and architectural boundary violations.
4. Render a clear verdict:
   - PASS: Milestone is approved and verified.
   - FAIL: Milestone is rejected; provide specific, actionable feedback on what failed so the Worker can fix it.
5. STRICT RULE: A milestone cannot complete without your explicit verification and approval.`,
    allowedActions: ['run_tests', 'run_linter', 'check_git_diff', 'verify_criteria', 'read_file'],
    color: '#00B42A', // Green
    icon: 'CheckOne',
  },
};

export const getRoleDefinition = (role: TeamworkRole): RoleDefinition => {
  return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.sentinel;
};
