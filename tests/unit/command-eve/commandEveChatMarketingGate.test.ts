/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// v15 A2 CAO security invariant (chat layer).
//
// The chat /marketing-loop|/marketing wiring lives in AionrsSendBox and MUST
// stop at the dispatch-plan rung. It must NEVER invoke the worker-executor
// promotion provider and MUST NEVER pass cao_gate_approved anywhere. A prior
// v15 draft hardcoded cao_gate_approved:true in the chat, which let the chat
// self-assert HG-3.5; this test fails closed if that regression ever returns.
//
// The HG-3.5 promotion is reachable ONLY through the Command Center
// explicit-approval button (covered by the ladder render test + the Command
// Center handler), never from chat.

const SEND_BOX_PATH = path.resolve(
  __dirname,
  '../../../packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx'
);

const stripComments = (source: string): string =>
  source
    // block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // line comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('Command EVE chat marketing gate (v15 A2 CAO invariant)', () => {
  const raw = fs.readFileSync(SEND_BOX_PATH, 'utf8');
  const code = stripComments(raw);

  it('chains the two gate-safe providers (create + dispatch-plan)', () => {
    expect(code).toContain('kanbanMarketingCardCreate.invoke');
    expect(code).toContain('kanbanMarketingDispatchPlan.invoke');
  });

  it('NEVER invokes the worker-executor-promotion provider from chat', () => {
    expect(code).not.toContain('kanbanMarketingWorkerExecutorPromotion');
    expect(code).not.toContain('worker-executor-promotion');
  });

  it('NEVER references cao_gate_approved anywhere in the chat code', () => {
    expect(code).not.toContain('cao_gate_approved');
  });

  it('does not invoke any later ladder rung provider from chat', () => {
    for (const provider of [
      'kanbanMarketingOutputApprove',
      'kanbanMarketingWorkerDispatchRequest',
      'kanbanMarketingWorkerObservedRun',
      'kanbanMarketingWorkerStartGate',
      'kanbanMarketingWorkerDispatcherPrepare',
    ]) {
      expect(code).not.toContain(`${provider}.invoke`);
    }
  });

  it('keeps a defensive comment documenting the chat-never-promotes invariant', () => {
    // The guard comment is intentionally preserved in the source (not stripped here).
    expect(raw).toContain('NEVER invokes worker-executor-promotion');
  });
});
