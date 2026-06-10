/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  appendCommandEveGateDecision,
  evaluateCommandEveGateDecision,
  normalizeCommandEveExecutionMode,
} from '@/process/commandEve/executionModeCore';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-execution-mode-'));
  roots.push(root);
  return root;
}

describe('Command EVE execution mode gate policy', () => {
  it('defaults unknown mode to delegated', () => {
    expect(normalizeCommandEveExecutionMode('nope')).toBe('delegated');
    expect(normalizeCommandEveExecutionMode('observed')).toBe('observed');
  });

  it('allows reversible work in observed mode while keeping founder stop semantics', () => {
    const decision = evaluateCommandEveGateDecision({ mode: 'observed', action: 'edit_code' });
    expect(decision.allowed).toBe(true);
    expect(decision.gate).toBe('founder_stop');
  });

  it('keeps irreversible actions HG-4 in every mode', () => {
    for (const mode of ['observed', 'delegated', 'autonomous'] as const) {
      const decision = evaluateCommandEveGateDecision({ mode, action: 'schema_auth_secret' });
      expect(decision.allowed).toBe(false);
      expect(decision.gate).toBe('hg_4');
    }
  });

  it('requires founder click for main merge in observed mode', () => {
    const decision = evaluateCommandEveGateDecision({ mode: 'observed', action: 'merge_main' });
    expect(decision.allowed).toBe(false);
    expect(decision.gate).toBe('founder_click');
  });

  it('runs truth gates automatically in every mode', () => {
    for (const mode of ['observed', 'delegated', 'autonomous'] as const) {
      const decision = evaluateCommandEveGateDecision({ mode, action: 'truth_gate' });
      expect(decision.allowed).toBe(true);
      expect(decision.gate).toBe('auto');
    }
  });

  it('appends decisions to a local audit ledger', () => {
    const root = makeRoot();
    const auditPath = path.join(root, 'gate-decisions.jsonl');
    const decision = evaluateCommandEveGateDecision({ mode: 'delegated', action: 'prepare_pr' });
    appendCommandEveGateDecision(auditPath, decision);

    const lines = fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      version: 'command-eve-gate-decision/v0',
      mode: 'delegated',
      action: 'prepare_pr',
    });
  });
});
