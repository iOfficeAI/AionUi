/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { decideAutoModelPhase, looksLikeReplanRequest } from '@/renderer/utils/autoModel/decideAutoModelPhase';

describe('looksLikeReplanRequest', () => {
  it('detects english and chinese replan cues', () => {
    expect(looksLikeReplanRequest('please replan the approach')).toBe(true);
    expect(looksLikeReplanRequest('换个方案试试')).toBe(true);
    expect(looksLikeReplanRequest('continue with step 3')).toBe(false);
  });
});

describe('decideAutoModelPhase', () => {
  it('uses planner on the first user turn', () => {
    expect(decideAutoModelPhase({ hasPriorUserTurns: false, userInput: 'build a todo app' })).toBe('planner');
  });

  it('uses worker for routine follow-ups', () => {
    expect(decideAutoModelPhase({ hasPriorUserTurns: true, userInput: 'ok continue' })).toBe('worker');
  });

  it('escalates to planner after worker failures or replan text', () => {
    expect(decideAutoModelPhase({ hasPriorUserTurns: true, userInput: 'ok', consecutiveWorkerFailures: 2 })).toBe(
      'planner'
    );
    expect(decideAutoModelPhase({ hasPriorUserTurns: true, userInput: 'rethink the architecture' })).toBe('planner');
  });
});
