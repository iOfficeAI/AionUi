/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildRateLimitNotice,
  shouldShowRateLimitNotice,
  type SessionMessageRateLimitedPayload,
} from '@/renderer/hooks/system/useCrossSessionRateLimitNotice';

const payload = (overrides: Partial<SessionMessageRateLimitedPayload> = {}): SessionMessageRateLimitedPayload => ({
  user_id: 'user_1',
  from_conversation_id: 'c1',
  from_name: 'A',
  to_conversation_id: 'c2',
  to_name: 'B',
  window_count: 10,
  gate: 'pair',
  ...overrides,
});

describe('shouldShowRateLimitNotice', () => {
  it('ignores an event for another user', () => {
    // BroadcastEventBus fans out to every connection, so payload filtering is
    // the only thing preventing one user's conversation names from showing up
    // in another user's UI.
    expect(shouldShowRateLimitNotice(payload({ user_id: 'user_2' }), 'user_1')).toBe(false);
  });

  it('shows an event for the current user', () => {
    expect(shouldShowRateLimitNotice(payload(), 'user_1')).toBe(true);
  });

  it('shows nothing when the current user is unknown', () => {
    // Failing closed: without an identity we cannot prove the event is ours.
    expect(shouldShowRateLimitNotice(payload(), undefined)).toBe(false);
  });
});

describe('buildRateLimitNotice', () => {
  it('names both conversations and offers both ids to stop', () => {
    const notice = buildRateLimitNotice(payload());
    expect(notice.conversationIdsToStop).toEqual(['c1', 'c2']);
    expect(notice.message).toContain('A');
    expect(notice.message).toContain('B');
  });

  it('falls back to ids when a name is missing', () => {
    const notice = buildRateLimitNotice(payload({ from_name: '', to_name: '' }));
    expect(notice.message).toContain('c1');
    expect(notice.message).toContain('c2');
  });

  it('never carries a message body', () => {
    const notice = buildRateLimitNotice(payload());
    expect(JSON.stringify(notice)).not.toMatch(/body|content|message_text/);
  });

  it('uses the injected describer so the copy can be localised', () => {
    const notice = buildRateLimitNotice(payload(), (from, to) => `${from}/${to} looping`);
    expect(notice.message).toBe('A/B looping');
  });

  it('stops the sender and the recipient, in that order', () => {
    // Both sides must stop: cancelling only one lets the other's queued
    // delivery restart it (spec §6.9).
    const notice = buildRateLimitNotice(payload({ from_conversation_id: 'from', to_conversation_id: 'to' }));
    expect(notice.conversationIdsToStop).toEqual(['from', 'to']);
  });
});
