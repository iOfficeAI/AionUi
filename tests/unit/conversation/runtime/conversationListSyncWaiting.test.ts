/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  applyWaitingConfirmationTransition,
  extractConfirmationId,
  isWaitingConfirmationStreamMessage,
  RUNTIME_PENDING_CONFIRMATION_ID,
  shouldReconcileMarkWaiting,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('isWaitingConfirmationStreamMessage', () => {
  it.each(['permission', 'acp_permission', 'ask'])('treats %s as a waiting-confirmation frame', (type) => {
    expect(isWaitingConfirmationStreamMessage(type)).toBe(true);
  });

  it.each(['content', 'tool_call', 'finish', 'thinking', 'plan'])('does not treat %s as waiting', (type) => {
    expect(isWaitingConfirmationStreamMessage(type)).toBe(false);
  });
});

describe('extractConfirmationId', () => {
  it('reads request_id from an ask frame', () => {
    expect(extractConfirmationId({ type: 'ask', data: { request_id: 'req-1', questions: [] } })).toBe('req-1');
  });

  it('prefers call_id on a permission frame', () => {
    expect(extractConfirmationId({ type: 'permission', data: { id: 'conf-1', call_id: 'call-1' } })).toBe('call-1');
  });

  it('falls back to id on a permission frame without call_id', () => {
    expect(extractConfirmationId({ type: 'permission', data: { id: 'conf-1' } })).toBe('conf-1');
  });

  it('reads tool_call.tool_call_id from an acp_permission frame', () => {
    expect(extractConfirmationId({ type: 'acp_permission', data: { tool_call: { tool_call_id: 'tc-1' } } })).toBe(
      'tc-1'
    );
  });

  it('returns undefined when the id field is missing', () => {
    expect(extractConfirmationId({ type: 'acp_permission', data: { tool_call: {} } })).toBeUndefined();
    expect(extractConfirmationId({ type: 'ask', data: {} })).toBeUndefined();
    expect(extractConfirmationId({ type: 'permission', data: undefined })).toBeUndefined();
  });

  it('returns undefined for a non-confirmation frame', () => {
    expect(extractConfirmationId({ type: 'content', data: { call_id: 'x' } })).toBeUndefined();
  });
});

describe('applyWaitingConfirmationTransition', () => {
  it('adds a confirmation id on mark', () => {
    const next = applyWaitingConfirmationTransition(new Set(), { kind: 'mark', confirmationId: 'a' });
    expect([...next]).toEqual(['a']);
  });

  it('removes a confirmation id on unmark, emptying the set', () => {
    const next = applyWaitingConfirmationTransition(new Set(['a']), { kind: 'unmark', confirmationId: 'a' });
    expect(next.size).toBe(0);
  });

  it('keeps other pending ids when one of several is unmarked', () => {
    const next = applyWaitingConfirmationTransition(new Set(['a', 'b']), { kind: 'unmark', confirmationId: 'a' });
    expect([...next]).toEqual(['b']);
  });

  it('drops the runtime sentinel on any unmark (a concrete resolution invalidates the guess)', () => {
    const next = applyWaitingConfirmationTransition(new Set([RUNTIME_PENDING_CONFIRMATION_ID]), {
      kind: 'unmark',
      confirmationId: 'some-unknown-id',
    });
    expect(next.size).toBe(0);
  });

  it('empties the set on clear', () => {
    const next = applyWaitingConfirmationTransition(new Set(['a', 'b']), { kind: 'clear' });
    expect(next.size).toBe(0);
  });

  it('does not mutate the input set', () => {
    const current = new Set(['a']);
    applyWaitingConfirmationTransition(current, { kind: 'mark', confirmationId: 'b' });
    expect([...current]).toEqual(['a']);
  });
});

describe('shouldReconcileMarkWaiting', () => {
  it('marks waiting when the runtime reports pending confirmations', () => {
    expect(shouldReconcileMarkWaiting(1)).toBe(true);
  });

  it('does not mark when there are no pending confirmations', () => {
    expect(shouldReconcileMarkWaiting(0)).toBe(false);
  });
});
