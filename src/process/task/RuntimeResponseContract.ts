/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup } from '@/common/chat/chatLib';

const PORTFOLIO_REVIEW_ASSISTANT_ID = 'custom-1776969323991';
const SCHEMA_VERSION = 1;

const ALLOWED_FIRST_VISIBLE_LINES = [
  '# Senior PM Portfolio Construction Packet',
  '# Portfolio Construction Pass Brief',
  '# Portfolio Construction RFI',
  '# Portfolio Construction Input Scaffold',
] as const;

const REQUIRED_MONITORING_SECTIONS = [
  '## Known Facts',
  '## Measurement',
  '## Attribution',
  '## Appraisal',
  '## Implementation And Rebalancing',
  '## Monitoring Dashboard',
  '## Bottom Line',
];

const FORBIDDEN_VISIBLE_PATTERNS: RegExp[] = [
  /<\/?think>/i,
  /<\/?analysis>/i,
  /^\s*Brief\s*$/im,
  /^\s*Fixed\s*$/im,
  /^\s*You Need To Do\s*$/im,
  /^\s*Next\s*$/im,
  /^\s*Let me\b/im,
  /^\s*I should\b/im,
  /^\s*Looking at (?:the )?skills\b/im,
  /\bskill[- ]selection narration\b/i,
  /\b(?:search|look through|inspect) (?:the )?(?:workspace|working directory|files)\b/i,
];

export type RuntimeContractPromptFamily =
  | 'direct_monitoring_review'
  | 'direct_policy_review'
  | 'direct_pass_brief'
  | 'direct_rfi';

export type RuntimeContractState = {
  schemaVersion: number;
  active: boolean;
  assistantId?: string;
  promptFamily?: RuntimeContractPromptFamily;
  appliesUntil: 'first_valid_artifact';
  firstArtifactSeen: boolean;
  deniedToolCalls: RuntimeContractToolTrace[];
  hiddenReasoningTrace: string[];
  rawContentTrace: string[];
  repeatedToolViolation: boolean;
  debug: boolean;
};

export type RuntimeContractToolTrace = {
  callId: string;
  name: string;
  description?: string;
  reason: string;
  deniedAt: number;
};

export type RuntimeContractFinalizeResult = {
  visibleText: string;
  status: 'passed' | 'repaired' | 'blocked' | 'inactive';
  errors: string[];
  cropped: boolean;
};

type CreateRuntimeContractStateInput = {
  assistantId?: string;
  prompt: string;
  isFirstTurn: boolean;
  runtimeContracts?: {
    enabled?: boolean;
    debug?: boolean;
  };
};

function classifyPromptFamily(prompt: string): RuntimeContractPromptFamily | undefined {
  const text = prompt.toLowerCase();
  if (
    text.includes('review this quarter') ||
    (text.includes('quarter') &&
      (text.includes('endowment') || text.includes('foundation') || text.includes('family office')) &&
      (text.includes('policy') || text.includes('monitoring') || text.includes('benchmark')))
  ) {
    return 'direct_monitoring_review';
  }
  if (text.includes('policy review') || (text.includes('existing') && text.includes('policy'))) {
    return 'direct_policy_review';
  }
  if (text.includes('pass brief') || text.includes('missing cme') || text.includes('missing inputs')) {
    return 'direct_pass_brief';
  }
  if (/\brfi\b/i.test(prompt) || text.includes('request for information')) {
    return 'direct_rfi';
  }
  return undefined;
}

export function createRuntimeResponseContractState(input: CreateRuntimeContractStateInput): RuntimeContractState {
  const enabled = input.runtimeContracts?.enabled !== false;
  const promptFamily = classifyPromptFamily(input.prompt);
  const active =
    enabled && input.isFirstTurn && input.assistantId === PORTFOLIO_REVIEW_ASSISTANT_ID && Boolean(promptFamily);

  return {
    schemaVersion: SCHEMA_VERSION,
    active,
    assistantId: input.assistantId,
    promptFamily,
    appliesUntil: 'first_valid_artifact',
    firstArtifactSeen: false,
    deniedToolCalls: [],
    hiddenReasoningTrace: [],
    rawContentTrace: [],
    repeatedToolViolation: false,
    debug: Boolean(input.runtimeContracts?.debug),
  };
}

export function isRuntimeResponseContractActive(
  state: RuntimeContractState | null | undefined
): state is RuntimeContractState {
  return Boolean(state?.active && !state.firstArtifactSeen);
}

export function recordRuntimeContractRawContent(state: RuntimeContractState | null | undefined, content: string): void {
  if (!state?.active || !state.debug || !content) return;
  state.rawContentTrace.push(content);
}

export function recordRuntimeContractReasoning(state: RuntimeContractState | null | undefined, content: string): void {
  if (!state?.active || !content) return;
  if (state.debug) state.hiddenReasoningTrace.push(content);
}

function isForbiddenToolName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'glob' ||
    lower === 'read' ||
    lower.includes('workspace_search') ||
    lower.includes('search_workspace') ||
    lower.includes('workspace.search')
  );
}

export function denyForbiddenPreArtifactTools(
  state: RuntimeContractState | null | undefined,
  tools: IMessageToolGroup['content']
): RuntimeContractToolTrace[] {
  if (!isRuntimeResponseContractActive(state)) return [];
  const denied: RuntimeContractToolTrace[] = [];
  for (const tool of tools) {
    if (tool.status !== 'Confirming') continue;
    if (!isForbiddenToolName(tool.name)) continue;
    const denial: RuntimeContractToolTrace = {
      callId: tool.callId,
      name: tool.name,
      description: tool.description,
      reason: 'runtime-contract forbids pre-artifact workspace search/read tools',
      deniedAt: Date.now(),
    };
    denied.push(denial);
    state.deniedToolCalls.push(denial);
  }
  if (denied.length > 0 && state.deniedToolCalls.length > denied.length) {
    state.repeatedToolViolation = true;
  }
  return denied;
}

function firstLine(text: string): string {
  return text.trimStart().split(/\r?\n/, 1)[0]?.trimEnd() ?? '';
}

function findFirstAllowedHeadingIndex(text: string): number {
  const indexes = ALLOWED_FIRST_VISIBLE_LINES.map((heading) => text.indexOf(heading)).filter((idx) => idx >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

function validateVisibleText(text: string): string[] {
  const errors: string[] = [];
  const first = firstLine(text);
  if (!ALLOWED_FIRST_VISIBLE_LINES.includes(first as (typeof ALLOWED_FIRST_VISIBLE_LINES)[number])) {
    errors.push(`first visible line '${first || '<empty>'}' is not allowed`);
  }
  for (const pattern of FORBIDDEN_VISIBLE_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(`forbidden visible pattern matched: ${pattern.source}`);
    }
  }
  if (first === '# Senior PM Portfolio Construction Packet') {
    for (const section of REQUIRED_MONITORING_SECTIONS) {
      if (!text.includes(section)) errors.push(`missing required section: ${section}`);
    }
  }
  return errors;
}

function buildRuntimeContractBlocker(errors: string[]): string {
  const rows = errors.map((error) => `| Runtime contract | ${error.replace(/\|/g, '/')} | yes |`).join('\n');
  return [
    '# Portfolio Construction Input Scaffold',
    '',
    'The runtime blocked the first response before display because it did not satisfy the selected assistant response contract.',
    '',
    '## Missing Runtime Preconditions',
    '| Field | Why it matters | Needed to proceed? |',
    '|---|---|---|',
    rows || '| Runtime contract | Unknown validation failure | yes |',
    '',
    '## Permitted Next Step',
    'Regenerate a governed portfolio-construction packet without hidden reasoning, skill narration, or pre-artifact workspace search.',
  ].join('\n');
}

export function finalizeRuntimeResponseContract(
  state: RuntimeContractState | null | undefined,
  rawVisibleText: string
): RuntimeContractFinalizeResult {
  if (!state?.active) {
    return { visibleText: rawVisibleText, status: 'inactive', errors: [], cropped: false };
  }

  const deniedTools = state.deniedToolCalls.length > 0;
  let candidate = rawVisibleText.trimStart();
  let cropped = false;
  const headingIndex = findFirstAllowedHeadingIndex(candidate);

  if (headingIndex > 0 && !deniedTools) {
    candidate = candidate.slice(headingIndex).trimStart();
    cropped = true;
  }

  const errors = validateVisibleText(candidate);
  if (deniedTools) {
    errors.push('forbidden pre-artifact tool/search occurred before a valid artifact');
  }
  if (state.repeatedToolViolation) {
    errors.push('forbidden pre-artifact tool/search repeated after denial');
  }

  if (errors.length === 0) {
    state.firstArtifactSeen = true;
    return {
      visibleText: candidate,
      status: cropped ? 'repaired' : 'passed',
      errors,
      cropped,
    };
  }

  const blocker = buildRuntimeContractBlocker(errors);
  state.firstArtifactSeen = true;
  return {
    visibleText: blocker,
    status: 'blocked',
    errors,
    cropped: false,
  };
}
