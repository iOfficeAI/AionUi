/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

export type CommandEveExecutionMode = 'observed' | 'delegated' | 'autonomous';

export type CommandEveGateAction =
  | 'edit_code'
  | 'prepare_pr'
  | 'run_local_tests'
  | 'merge_main'
  | 'prod_write'
  | 'money'
  | 'external_send'
  | 'schema_auth_secret'
  | 'truth_gate';

export type CommandEveGateDecision = {
  version: 'command-eve-gate-decision/v0';
  decided_at: string;
  mode: CommandEveExecutionMode;
  action: CommandEveGateAction;
  allowed: boolean;
  gate: 'auto' | 'founder_stop' | 'founder_click' | 'hg_2_5' | 'hg_4' | 'cao_required';
  reason: string;
};

const EXECUTION_MODES = new Set<CommandEveExecutionMode>(['observed', 'delegated', 'autonomous']);

export function normalizeCommandEveExecutionMode(value: unknown): CommandEveExecutionMode {
  return typeof value === 'string' && EXECUTION_MODES.has(value as CommandEveExecutionMode)
    ? (value as CommandEveExecutionMode)
    : 'delegated';
}

export function evaluateCommandEveGateDecision(options: {
  mode?: unknown;
  action: CommandEveGateAction;
  now?: () => Date;
}): CommandEveGateDecision {
  const mode = normalizeCommandEveExecutionMode(options.mode);
  const decidedAt = (options.now || (() => new Date()))().toISOString();
  const base = {
    version: 'command-eve-gate-decision/v0' as const,
    decided_at: decidedAt,
    mode,
    action: options.action,
  };

  if (options.action === 'truth_gate') {
    return {
      ...base,
      allowed: true,
      gate: 'auto',
      reason: 'Truth-gates run in every execution mode; red gates block downstream promotion.',
    };
  }

  if (['prod_write', 'money', 'external_send', 'schema_auth_secret'].includes(options.action)) {
    return {
      ...base,
      allowed: false,
      gate: 'hg_4',
      reason:
        'Irreversible, external, financial, production, auth or secret-impacting actions require HG-4 in all modes.',
    };
  }

  if (options.action === 'run_local_tests') {
    return {
      ...base,
      allowed: true,
      gate: 'auto',
      reason: 'Local tests and verification gates are always allowed and expected.',
    };
  }

  if (options.action === 'merge_main') {
    if (mode === 'observed') {
      return {
        ...base,
        allowed: false,
        gate: 'founder_click',
        reason: 'Observed mode collapses merge ceremony to explicit founder click, but never auto-merges.',
      };
    }
    return {
      ...base,
      allowed: false,
      gate: mode === 'autonomous' ? 'cao_required' : 'hg_2_5',
      reason:
        mode === 'autonomous'
          ? 'Autonomous merge requires HG-2.5 plus independent CAO verification.'
          : 'Delegated merge requires HG-2.5 release authority.',
    };
  }

  if (mode === 'autonomous') {
    return {
      ...base,
      allowed: false,
      gate: 'hg_2_5',
      reason: 'Autonomous mode gates reversible code/build/PR preparation until the truth-gate stack is proven.',
    };
  }

  return {
    ...base,
    allowed: true,
    gate: mode === 'observed' ? 'founder_stop' : 'auto',
    reason:
      mode === 'observed'
        ? 'Founder is watching live and can stop reversible work at any time.'
        : 'Delegated reversible work may proceed; irreversible boundaries remain gated separately.',
  };
}

export function appendCommandEveGateDecision(auditLogPath: string, decision: CommandEveGateDecision): void {
  if (!auditLogPath) return;
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
  fs.appendFileSync(auditLogPath, `${JSON.stringify(decision)}\n`, { mode: 0o600 });
}
