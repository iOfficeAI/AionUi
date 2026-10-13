/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommandItem } from './types';

export type AntigravityCommandName =
  | 'goal'
  | 'teamwork'
  | 'teamwork-preview'
  | 'plan'
  | 'grill-me'
  | 'boost'
  | 'browser'
  | 'schedule'
  | 'learn';

export interface AntigravityCommandSpec {
  name: AntigravityCommandName;
  i18nKey: string;
  defaultDescription: string;
}

export const ANTIGRAVITY_COMMAND_SPECS: readonly AntigravityCommandSpec[] = [
  {
    name: 'goal',
    i18nKey: 'messages.slash.antigravity.goal',
    defaultDescription: 'Run a long-running task thoroughly until completion',
  },
  {
    name: 'teamwork',
    i18nKey: 'messages.slash.antigravity.teamworkPreview',
    defaultDescription: 'Multi-agent teamwork workflow for complex projects',
  },
  {
    name: 'teamwork-preview',
    i18nKey: 'messages.slash.antigravity.teamworkPreview',
    defaultDescription: 'Multi-agent teamwork workflow for complex projects',
  },
  {
    name: 'plan',
    i18nKey: 'messages.slash.antigravity.plan',
    defaultDescription: 'Step-by-step implementation planning before execution',
  },
  {
    name: 'grill-me',
    i18nKey: 'messages.slash.antigravity.grillMe',
    defaultDescription: 'Interactive interview to align on design decisions and trade-offs',
  },
  {
    name: 'boost',
    i18nKey: 'messages.slash.antigravity.boost',
    defaultDescription: 'Deep thinking, strategic planning, and rigorous verification',
  },
  {
    name: 'browser',
    i18nKey: 'messages.slash.antigravity.browser',
    defaultDescription: 'Web browsing, documentation retrieval, and online research',
  },
  {
    name: 'schedule',
    i18nKey: 'messages.slash.antigravity.schedule',
    defaultDescription: 'Recurring schedule or timed task execution',
  },
  {
    name: 'learn',
    i18nKey: 'messages.slash.antigravity.learn',
    defaultDescription: 'Persist learnings, rules, and guidelines for future tasks',
  },
];

const ANTIGRAVITY_COMMAND_NAMES = new Set<string>(ANTIGRAVITY_COMMAND_SPECS.map((spec) => spec.name));

export const isAntigravitySlashCommand = (name: string): name is AntigravityCommandName =>
  ANTIGRAVITY_COMMAND_NAMES.has(name.toLowerCase());

/**
 * Returns slash command items for all Antigravity shortcuts formatted for
 * autocomplete in the chat input.
 */
export const getAntigravitySlashCommands = (
  t: (key: string, options?: { defaultValue?: string }) => string
): SlashCommandItem[] =>
  ANTIGRAVITY_COMMAND_SPECS.map((spec) => ({
    name: spec.name,
    description: t(spec.i18nKey, { defaultValue: spec.defaultDescription }),
    kind: 'template',
    source: 'builtin',
    hint: 'Antigravity',
    selectionBehavior: 'insert',
  }));

const ANTIGRAVITY_PARSE_RE =
  /^\/(goal|teamwork-preview|teamwork|plan|grill-me|boost|browser|schedule|learn)(?:[\s\n]+([\s\S]*))?$/i;

/**
 * Builds the augmented prompt wrapper for a given Antigravity slash command and payload.
 */
export const formatAntigravityPrompt = (command: AntigravityCommandName, payload: string): string => {
  const content = payload.trim();
  const taskText = content.length > 0 ? content : '(No details provided - please clarify your goal)';

  switch (command) {
    case 'goal':
      return [
        '[Antigravity /goal Mode]',
        `Goal: ${taskText}`,
        '',
        'Instructions:',
        'The user has marked this task with /goal, indicating that this task is intended to run autonomously until the goal is fully achieved.',
        '1. Be extra thorough and do not stop until you are confident the goal has been completely fulfilled.',
        '2. Self-audit your work rigorously: verify syntax, test execution, edge cases, and all requirements.',
        '3. Once complete, include <!-- GOAL_COMPLETE --> in your response. If explicitly asked to cancel or stop, include <!-- GOAL_CANCELLED -->.',
      ].join('\n');

    case 'teamwork':
    case 'teamwork-preview':
      return [
        '[Antigravity /teamwork-preview Mode]',
        `Project: ${taskText}`,
        '',
        'Workflow (Multi-Agent Teamwork):',
        'Phase 1 (Scoping & Verification):',
        '1. Maintain a structured project prompt draft artifact.',
        '2. Specify WHAT is needed, not HOW to implement it.',
        '3. Establish objective, automated verification mechanisms and concrete acceptance criteria.',
        'Phase 2 (Delegation & Execution):',
        'Coordinate execution across specialized autonomous subagents to iteratively implement, review, and verify all deliverables.',
      ].join('\n');

    case 'plan':
      return [
        '[Antigravity /plan Mode]',
        `Task: ${taskText}`,
        '',
        'Instructions:',
        'The user has requested a structured, step-by-step implementation plan before writing code or executing changes.',
        '1. Identify architectural considerations, dependencies, and constraints.',
        '2. Break the task down into distinct, verifiable phases and deliverables.',
        '3. Detail potential risks, edge cases, and explicit verification steps for each phase.',
        '4. Await user feedback and alignment before proceeding with implementation.',
      ].join('\n');

    case 'grill-me':
      return [
        '[Antigravity /grill-me Mode]',
        `Topic: ${taskText}`,
        '',
        'Instructions:',
        'Conduct an interactive interview to align on design decisions, uncover blind spots, and resolve architectural trade-offs.',
        '1. Ask probing, critical questions about requirements, edge cases, scalability, and failure modes.',
        '2. Ask questions concisely, one at a time or in small focused batches.',
        '3. Challenge assumptions and suggest concrete alternatives with pros and cons.',
      ].join('\n');

    case 'boost':
      return [
        '[Antigravity /boost Mode]',
        `Task: ${taskText}`,
        '',
        'Instructions:',
        'The user has enabled Boost mode for maximum analytical depth and rigorous execution.',
        '1. Analyze the problem from first principles with deep strategic thinking.',
        '2. Evaluate multiple alternative perspectives, trade-offs, and architectures.',
        '3. Anticipate edge cases, performance bottlenecks, and security considerations.',
        '4. Verify all assertions and test solutions thoroughly before presenting conclusions.',
      ].join('\n');

    case 'browser':
      return [
        '[Antigravity /browser Mode]',
        `Query: ${taskText}`,
        '',
        'Instructions:',
        'The user has requested web browsing, documentation lookup, and online research.',
        '1. Search for official documentation, recent release notes, and authoritative sources.',
        '2. Verify API specs, version compatibility, and known issues.',
        '3. Synthesize findings clearly with direct references and citations.',
      ].join('\n');

    case 'schedule':
      return [
        '[Antigravity /schedule Mode]',
        `Instruction: ${taskText}`,
        '',
        'Instructions:',
        'The user wants to set up a recurring schedule or timed execution for this task.',
        '1. Determine whether this requires a recurring cron schedule or a one-shot delay.',
        '2. Formulate the precise cron expression or timer duration.',
        '3. Specify the exact prompt and conditions to run upon trigger.',
      ].join('\n');

    case 'learn':
      return [
        '[Antigravity /learn Mode]',
        `Instruction: ${taskText}`,
        '',
        'Instructions:',
        'The user wants to extract and persist key learnings, guidelines, and rules from this interaction.',
        '1. Distill the user feedback, correction, or project convention clearly.',
        '2. Format as a concise, actionable guideline for future tasks.',
        '3. Detail where and how this rule should be remembered in the project workspace.',
      ].join('\n');
  }
};

/**
 * If the input starts with an Antigravity slash command (e.g. `/goal ...`),
 * expands it into the full prompt wrapper directive. Otherwise returns the original input.
 */
export const expandAntigravitySlashCommand = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(ANTIGRAVITY_PARSE_RE);
  if (!match) {
    return input;
  }

  const rawCommand = match[1].toLowerCase();
  if (!isAntigravitySlashCommand(rawCommand)) {
    return input;
  }

  const payload = match[2] ?? '';
  return formatAntigravityPrompt(rawCommand, payload);
};

/**
 * Checks if the input is a /teamwork or /teamwork-preview slash command.
 */
export const isTeamworkSlashCommand = (input: string): boolean => {
  const trimmed = input.trim();
  const match = trimmed.match(ANTIGRAVITY_PARSE_RE);
  if (!match) return false;
  const cmd = match[1].toLowerCase();
  return cmd === 'teamwork' || cmd === 'teamwork-preview';
};

/**
 * Extracts task payload from a /teamwork or /teamwork-preview slash command.
 */
export const extractTeamworkTask = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(ANTIGRAVITY_PARSE_RE);
  if (!match) return trimmed;
  return (match[2] ?? '').trim();
};
