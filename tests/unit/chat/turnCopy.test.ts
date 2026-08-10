/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildTurnClipboardText, collectAiCopyRows } from '@/renderer/utils/chat/turnCopy';

const user = (id: string) => ({ id, type: 'text', position: 'right', content: { content: 'q' } });
const aiText = (id: string, content: string) => ({ id, type: 'text', position: 'left', content: { content } });
const tool = (id: string) => ({ id, type: 'tool_call', position: 'left', content: {} });
const thinking = (id: string) => ({ id, type: 'thinking', position: 'left', content: { content: 'hmm' } });

describe('collectAiCopyRows', () => {
  it('puts the row on a simple single-text turn and carries its text', () => {
    const { copyRowIds, turnTextsById } = collectAiCopyRows([user('u1'), aiText('a1', 'hello')], false);
    expect([...copyRowIds]).toEqual(['a1']);
    expect(turnTextsById.get('a1')).toEqual(['hello']);
  });

  it('collects EVERY text segment of a turn split by tool calls and thinking', () => {
    // The bug: copying the turn only yielded segment B; A was lost.
    const { copyRowIds, turnTextsById } = collectAiCopyRows(
      [user('u1'), aiText('a1', 'part A'), tool('t1'), thinking('th1'), aiText('a2', 'part B')],
      false
    );
    expect([...copyRowIds]).toEqual(['a2']);
    expect(turnTextsById.get('a2')).toEqual(['part A', 'part B']);
  });

  it('keeps turns separated by user messages independent', () => {
    const { copyRowIds, turnTextsById } = collectAiCopyRows(
      [user('u1'), aiText('a1', 'first'), user('u2'), aiText('b1', 'second-1'), tool('t1'), aiText('b2', 'second-2')],
      false
    );
    expect([...copyRowIds]).toEqual(['a1', 'b2']);
    expect(turnTextsById.get('a1')).toEqual(['first']);
    expect(turnTextsById.get('b2')).toEqual(['second-1', 'second-2']);
  });

  it('withholds the final turn while streaming, texts included', () => {
    const { copyRowIds, turnTextsById } = collectAiCopyRows(
      [user('u1'), aiText('a1', 'done turn'), user('u2'), aiText('b1', 'still streaming')],
      true
    );
    expect([...copyRowIds]).toEqual(['a1']);
    expect(turnTextsById.has('b1')).toBe(false);
  });

  it('ignores pseudo entries without breaking the turn', () => {
    const { turnTextsById } = collectAiCopyRows(
      [
        user('u1'),
        aiText('a1', 'part A'),
        { id: 's1', type: 'tool_summary', position: 'left', content: {} },
        aiText('a2', 'part B'),
      ],
      false
    );
    expect(turnTextsById.get('a2')).toEqual(['part A', 'part B']);
  });

  it('skips empty text segments', () => {
    const { turnTextsById } = collectAiCopyRows([user('u1'), aiText('a1', '  '), aiText('a2', 'real')], false);
    expect(turnTextsById.get('a2')).toEqual(['real']);
  });
});

describe('buildTurnClipboardText', () => {
  it('joins segments with a blank line', () => {
    expect(buildTurnClipboardText(['part A', 'part B'])).toBe('part A\n\npart B');
  });

  it('strips think tags and skill-suggest blocks per segment', () => {
    const joined = buildTurnClipboardText([
      '<think>draft</think>answer',
      'tail [SKILL_SUGGEST]{"skills":[]}[/SKILL_SUGGEST]',
    ]);
    expect(joined).not.toContain('draft');
    expect(joined).not.toContain('SKILL_SUGGEST');
    expect(joined).toContain('answer');
    expect(joined).toContain('tail');
  });

  it('drops segments that clean down to nothing', () => {
    expect(buildTurnClipboardText(['<think>only draft</think>', 'kept'])).toBe('kept');
  });
});
