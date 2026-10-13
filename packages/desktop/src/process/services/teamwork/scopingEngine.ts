/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type {
  InterviewQuestion,
  InterviewQuestionCategory,
  TeamworkMilestone,
  TeamworkSubtask,
} from '@/common/types/teamwork';

/**
 * Prompt template used to instruct an LLM to generate targeted clarifying questions.
 */
export const buildInterviewPrompt = (userRequest: string): string => {
  return [
    'You are Sentinel, the lead scoping architect in a multi-agent teamwork system.',
    'Carefully analyze the user request below and formulate 3 to 5 targeted, high-value clarifying questions.',
    'Focus on discovering:',
    '1. Architecture & Boundaries (design patterns, API contracts, state management)',
    '2. Testing Bounds & Strategy (unit test coverage, test fixtures, mocks vs live services)',
    '3. Constraints & Non-Functional Requirements (performance, backward compatibility, platform constraints)',
    '4. Scope Boundaries (must-haves vs explicitly deferred items)',
    '',
    `User Request: "${userRequest.trim()}"`,
    '',
    'Output MUST be a strict JSON array of objects with the following schema:',
    '[',
    '  {',
    '    "id": "q1",',
    '    "question": "Question text...",',
    '    "options": ["Option A", "Option B", "Option C"],',
    '    "category": "architecture" | "testing" | "constraints" | "scope"',
    '  }',
    ']',
    'Respond with ONLY valid JSON without conversational wrapper text.',
  ].join('\n');
};

/**
 * Robust JSON extraction from LLM text output.
 */
export const parseQuestionsFromLLM = (text: string): InterviewQuestion[] => {
  try {
    const trimmed = text.trim();
    // Try directly parsing
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return JSON.parse(trimmed) as InterviewQuestion[];
    }

    // Try extracting from markdown ```json code block
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return JSON.parse(codeBlockMatch[1].trim()) as InterviewQuestion[];
    }

    // Try finding the first '[' and last ']'
    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const slice = trimmed.slice(firstBracket, lastBracket + 1);
      return JSON.parse(slice) as InterviewQuestion[];
    }
  } catch (error) {
    console.warn('[ScopingEngine] Failed to parse LLM questions JSON:', error);
  }

  return [];
};

/**
 * Deterministic fallback generator that creates 3-5 high-value questions
 * customized based on user request keywords.
 */
export const generateDefaultQuestions = (userRequest: string): InterviewQuestion[] => {
  const reqLower = userRequest.toLowerCase();
  const questions: InterviewQuestion[] = [];

  // Question 1: Architecture
  if (
    reqLower.includes('api') ||
    reqLower.includes('backend') ||
    reqLower.includes('service') ||
    reqLower.includes('ipc')
  ) {
    questions.push({
      id: 'q_arch',
      question: 'What architectural communication pattern should be prioritized?',
      options: [
        'Typed IPC bridge with request/response and event emitters (Recommended)',
        'REST endpoints with polling',
        'Direct in-memory message bus',
      ],
      category: 'architecture',
    });
  } else if (
    reqLower.includes('ui') ||
    reqLower.includes('component') ||
    reqLower.includes('view') ||
    reqLower.includes('react')
  ) {
    questions.push({
      id: 'q_arch',
      question: 'What UI component architecture and state approach is preferred?',
      options: [
        'Modular React components using Arco Design with local state & hooks (Recommended)',
        'Global state store (Zustand / Redux)',
        'Headless primitives with custom CSS Modules',
      ],
      category: 'architecture',
    });
  } else {
    questions.push({
      id: 'q_arch',
      question: 'How should modules and responsibility boundaries be structured?',
      options: [
        'Modular services with clean separation of pure logic and I/O (Recommended)',
        'Monolithic single-module approach',
        'Plugin-based extension architecture',
      ],
      category: 'architecture',
    });
  }

  // Question 2: Testing Bounds
  questions.push({
    id: 'q_test',
    question: 'What are the required testing bounds and verification criteria?',
    options: [
      'Comprehensive unit tests with Vitest covering happy and error paths (>=80% coverage) (Recommended)',
      'Basic smoke tests for public APIs only',
      'Integration & contract testing without mock stubs',
    ],
    category: 'testing',
  });

  // Question 3: Constraints & Compatibility
  questions.push({
    id: 'q_constraints',
    question: 'What constraints or compatibility requirements must be strictly enforced?',
    options: [
      'Strict TypeScript (no `any`), no raw interactive HTML, full i18n support (Recommended)',
      'Backward compatibility with existing persistent session files',
      'Minimal external dependencies and zero bundle regressions',
    ],
    category: 'constraints',
  });

  // Question 4: Scope & Error Handling
  questions.push({
    id: 'q_scope',
    question: 'How should the system handle execution anomalies or verification failures?',
    options: [
      'Automatic Auditor retry loop with actionable feedback before user escalation (Recommended)',
      'Immediate halt and prompt user for manual intervention',
      'Log warning and proceed with partial milestone completion',
    ],
    category: 'scope',
  });

  return questions;
};

/**
 * Builds the complete list of clarifying questions.
 */
export const buildScopingQuestions = (userRequest: string, llmOutput?: string): InterviewQuestion[] => {
  if (llmOutput) {
    const parsed = parseQuestionsFromLLM(llmOutput);
    if (parsed.length >= 3) {
      return parsed.slice(0, 5);
    }
  }
  return generateDefaultQuestions(userRequest);
};

/**
 * Generates the ORIGINAL_REQUEST.md artifact markdown.
 */
export const generateOriginalRequestDoc = (
  userRequest: string,
  questions: InterviewQuestion[],
  answers: Record<string, string>
): string => {
  const timestamp = new Date().toISOString();
  const qaSection = questions
    .map((q, idx) => {
      const ans = answers[q.id] || answers[q.question] || 'Not specified (default applied)';
      return `### Question ${idx + 1} [${q.category.toUpperCase()}]: ${q.question}\n**User Answer:** ${ans}\n`;
    })
    .join('\n');

  return [
    '# ORIGINAL_REQUEST.md',
    '',
    `> **Generated At:** ${timestamp}`,
    '> **Framework:** Teamwork Multi-Agent Orchestration (/teamwork-preview)',
    '',
    '## 1. Executive Objective',
    userRequest.trim(),
    '',
    '## 2. Interactive Scoping Interview Results',
    qaSection,
    '',
    '## 3. Architectural Constraints & Non-Negotiable Bounds',
    '- **Process Boundaries:** Strict adherence to process boundary separation (no Node.js in renderer, no DOM in main).',
    '- **Type Safety:** 100% strict TypeScript types; no `any` assertions.',
    '- **UI Conventions:** UI components must use `@arco-design/web-react` and `@icon-park/react`; zero raw interactive HTML.',
    '- **Internationalization:** All user-facing strings must be localized via i18n keys across all supported locales.',
    '- **Verification Gate:** No milestone may transition to completed without Auditor sign-off.',
    '',
    '## 4. Scope Exclusions & Deferrals',
    '- Any non-critical refactoring of unrelated legacy components is out of scope.',
    '- Mock placeholders must not be accepted into verified code.',
  ].join('\n');
};

/**
 * Derives sequential milestones based on the request and answers.
 */
export const generateMilestones = (
  userRequest: string,
  _questions: InterviewQuestion[],
  _answers: Record<string, string>
): TeamworkMilestone[] => {
  const m1Subtasks: TeamworkSubtask[] = [
    {
      id: 'm1_t1',
      title: 'Analyze workspace AST & establish domain types',
      description: 'Explorer indexes existing codebase files and maps AST structures; Sentinel defines strict types.',
      status: 'pending',
      assignedRole: 'explorer',
    },
    {
      id: 'm1_t2',
      title: 'Define shared interfaces & role constraints',
      description: 'Worker creates typed contracts and role definitions.',
      status: 'pending',
      assignedRole: 'worker',
    },
  ];

  const m2Subtasks: TeamworkSubtask[] = [
    {
      id: 'm2_t1',
      title: 'Implement core state machine & orchestrator',
      description: 'Worker implements milestone state transitions and subagent dispatching.',
      status: 'pending',
      assignedRole: 'worker',
    },
    {
      id: 'm2_t2',
      title: 'Register IPC handlers & preload bridges',
      description: 'Worker sets up typed IPC channels for initiate, submit-interview, confirm-plan, and abort.',
      status: 'pending',
      assignedRole: 'worker',
    },
  ];

  const m3Subtasks: TeamworkSubtask[] = [
    {
      id: 'm3_t1',
      title: 'Build interactive InterviewView & MilestoneTracker components',
      description: 'Worker creates Arco Design questionnaire, progress board, and agent status badge.',
      status: 'pending',
      assignedRole: 'worker',
    },
    {
      id: 'm3_t2',
      title: 'Integrate Teamwork mode in chat input & SendBox',
      description: 'Worker wires Teamwork toggle and slash command trigger.',
      status: 'pending',
      assignedRole: 'worker',
    },
  ];

  const m4Subtasks: TeamworkSubtask[] = [
    {
      id: 'm4_t1',
      title: 'Execute test suite and verify state transitions',
      description: 'Auditor executes unit tests, verifying coverage and error resilience.',
      status: 'pending',
      assignedRole: 'auditor',
    },
    {
      id: 'm4_t2',
      title: 'Validate git diff against acceptance criteria',
      description: 'Auditor audits git diff, ensures zero linter/type errors, and approves final sign-off.',
      status: 'pending',
      assignedRole: 'auditor',
    },
  ];

  return [
    {
      id: 'milestone-1',
      title: 'Milestone 1: Architectural Scoping & Type System',
      description: 'Establish shared data contracts, role definitions, and scoping engine foundations.',
      subtasks: m1Subtasks,
      acceptanceCriteria: [
        'Shared types defined without type errors.',
        'Explorer role strictly configured as read-only.',
        'Scoping interview question generator and parser functioning.',
      ],
      status: 'pending',
    },
    {
      id: 'milestone-2',
      title: 'Milestone 2: Orchestration Engine & Verification Gates',
      description: 'Build state machine, subagent dispatching loop, context handoff, and IPC bridge.',
      subtasks: m2Subtasks,
      acceptanceCriteria: [
        'State transitions: interview -> scoping -> plan_ready -> executing -> verifying -> completed.',
        'Auditor agent verification gate prevents unverified milestone progression.',
        'Session state is persisted cleanly in workspace directory.',
      ],
      status: 'pending',
    },
    {
      id: 'milestone-3',
      title: 'Milestone 3: Interactive UI & Chat Integration',
      description: 'Implement InterviewView, MilestoneTracker, AgentStatusBadge, and prompt bar integration.',
      subtasks: m3Subtasks,
      acceptanceCriteria: [
        'InterviewView renders questionnaire with clean Arco Design components.',
        'MilestoneTracker visualizes live active milestone, subtasks, and role status.',
        'AgentStatusBadge displays active subagent, active tool call, and token counts.',
        'Full i18n support with no hardcoded strings.',
      ],
      status: 'pending',
    },
    {
      id: 'milestone-4',
      title: 'Milestone 4: Verification, Linting & Quality Audit',
      description: 'Execute unit test suites, verify all state transitions, and audit against quality checklist.',
      subtasks: m4Subtasks,
      acceptanceCriteria: [
        'All Vitest unit tests pass cleanly.',
        'Typecheck passes with zero errors (bunx tsc --noEmit).',
        'Auditor approves all deliverables against ORIGINAL_REQUEST.md.',
      ],
      status: 'pending',
    },
  ];
};

/**
 * Generates the PROJECT_PLAN.md artifact markdown.
 */
export const generateProjectPlanDoc = (userRequest: string, milestones: TeamworkMilestone[]): string => {
  const timestamp = new Date().toISOString();
  const milestonesMd = milestones
    .map((m, idx) => {
      const subtasksMd = m.subtasks
        .map((st) => `  - [ ] **[${st.assignedRole?.toUpperCase() || 'WORKER'}]** ${st.title}: ${st.description || ''}`)
        .join('\n');
      const criteriaMd = m.acceptanceCriteria.map((ac) => `  - [ ] ${ac}`).join('\n');

      return [
        `### ${m.title}`,
        `${m.description}`,
        '',
        '**Subtasks:**',
        subtasksMd,
        '',
        '**Auditor Acceptance Criteria:**',
        criteriaMd,
        '',
      ].join('\n');
    })
    .join('\n---\n\n');

  return [
    '# PROJECT_PLAN.md',
    '',
    `> **Generated At:** ${timestamp}`,
    `> **Project Scope:** ${userRequest.trim()}`,
    '> **Approval Status:** Pending User Confirmation',
    '',
    '## Overview & Milestone Hierarchy',
    'This plan defines the sequential milestones, subagent assignments, and verification gates for autonomous teamwork execution.',
    '',
    milestonesMd,
    '## Verification Gate Protocol',
    '1. Explorer provides context briefs for each milestone without polluting context.',
    '2. Worker implements code changes strictly within the milestone scope.',
    '3. Auditor executes verification tests and verifies git diffs against acceptance criteria.',
    '4. Sentinel advances to the next milestone only after the Auditor issues a PASS verdict.',
  ].join('\n');
};

/**
 * Persists ORIGINAL_REQUEST.md and PROJECT_PLAN.md into the workspace.
 */
export const persistWorkspaceArtifacts = async (
  workspacePath: string,
  originalRequestDoc: string,
  projectPlanDoc: string
): Promise<{ originalRequestPath: string; projectPlanPath: string }> => {
  const originalRequestPath = path.join(workspacePath, 'ORIGINAL_REQUEST.md');
  const projectPlanPath = path.join(workspacePath, 'PROJECT_PLAN.md');

  await fs.promises.mkdir(workspacePath, { recursive: true });
  await fs.promises.writeFile(originalRequestPath, originalRequestDoc, 'utf-8');
  await fs.promises.writeFile(projectPlanPath, projectPlanDoc, 'utf-8');

  return { originalRequestPath, projectPlanPath };
};
