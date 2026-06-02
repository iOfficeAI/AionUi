/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { classifyKind, fromAcpOptions, fromChislOptions } from '@renderer/components/approval/approvalOptions';

describe('classifyKind', () => {
  it.each([
    ['once', 'allow_once'],
    ['proceed_once', 'allow_once'],
    ['allow_once', 'allow_once'],
    ['yes', 'allow_once'],
    ['proceed_always', 'allow_always'],
    ['always', 'allow_always'],
    ['allow_dir', 'allow_scoped'],
    ['allow_session', 'allow_scoped'],
    ['scoped_path', 'allow_scoped'],
    ['reject', 'reject'],
    ['deny', 'reject'],
    ['cancel', 'reject'],
    ['no_thanks', 'reject'],
    ['', 'allow_once'],
    [null, 'allow_once'],
    [undefined, 'allow_once'],
  ])('classifyKind(%p) === %p', (input, expected) => {
    expect(classifyKind(input as string)).toBe(expected);
  });

  it('matches the source-plan precedence: scoped beats always when both are substrings', () => {
    // Per UI_02 the classifier checks reject → allow_scoped → allow_always →
    // allow_once in that order, so a label that contains BOTH "session" and
    // "always" lands on allow_scoped.
    expect(classifyKind('Yes, always for this session')).toBe('allow_scoped');
  });

  it('rejects text containing reject-ish word even with allow prefix', () => {
    expect(classifyKind('allow_then_reject')).toBe('reject');
  });
});

describe('fromChislOptions', () => {
  it('returns an empty list for null / undefined / non-array inputs', () => {
    expect(fromChislOptions(null)).toEqual([]);
    expect(fromChislOptions(undefined)).toEqual([]);
  });

  it('preserves the label as an i18n key and carries params', () => {
    const out = fromChislOptions([{ label: 'messages.confirmation.yesAllowOnce', value: 'once', params: { path: '/x' } }]);
    expect(out).toEqual([{ id: 'once', label: 'messages.confirmation.yesAllowOnce', isI18nKey: true, kind: 'allow_once', params: { path: '/x' } }]);
  });

  it('falls back to `option_<index>` when value is missing', () => {
    const out = fromChislOptions([{ label: 'Whatever' }]);
    expect(out[0]?.id).toBe('option_0');
  });

  it('falls back to id when label is missing', () => {
    const out = fromChislOptions([{ value: 'reject' }]);
    expect(out[0]?.label).toBe('reject');
  });

  it('coerces numeric / boolean values to string ids', () => {
    const out = fromChislOptions([{ label: 'lbl', value: 7 }, { label: 'lbl2', value: true }]);
    expect(out[0]?.id).toBe('7');
    expect(out[1]?.id).toBe('true');
  });

  it('classifies kinds from the value', () => {
    const out = fromChislOptions([
      { label: 'a', value: 'once' },
      { label: 'b', value: 'proceed_always' },
      { label: 'c', value: 'allow_dir' },
      { label: 'd', value: 'reject' },
    ]);
    expect(out.map((o) => o.kind)).toEqual(['allow_once', 'allow_always', 'allow_scoped', 'reject']);
  });
});

describe('fromAcpOptions', () => {
  it('returns an empty list for null / undefined / non-array inputs', () => {
    expect(fromAcpOptions(null)).toEqual([]);
    expect(fromAcpOptions(undefined)).toEqual([]);
  });

  it('uses option_id as id and name as label, marked non-i18n', () => {
    const out = fromAcpOptions([{ option_id: 'allow_once', name: 'Allow once' }]);
    expect(out).toEqual([{ id: 'allow_once', label: 'Allow once', isI18nKey: false, kind: 'allow_once', params: undefined }]);
  });

  it('prefers the explicit ACP `kind` when present', () => {
    const out = fromAcpOptions([{ option_id: 'opt_x', name: 'x', kind: 'reject' }]);
    expect(out[0]?.kind).toBe('reject');
  });

  it('falls back to id when option_id is missing', () => {
    const out = fromAcpOptions([{ name: 'Custom' }]);
    expect(out[0]?.id).toBe('option_0');
    expect(out[0]?.label).toBe('Custom');
  });

  it('falls back to id when name is missing', () => {
    const out = fromAcpOptions([{ option_id: 'allow_always' }]);
    expect(out[0]?.label).toBe('allow_always');
  });

  it('carries params through', () => {
    const out = fromAcpOptions([{ option_id: 'a', name: 'A', params: { sessionID: 'ses_1' } }]);
    expect(out[0]?.params).toEqual({ sessionID: 'ses_1' });
  });
});
