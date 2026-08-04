/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Large-file degradation for the markdown/html editors. The point worth locking
// down is NOT that highlighting turns off — it is that turning it off must not
// take undo/redo with it.
//
// HTMLEditor sets basicSetup `history: false` and supplies its own history()
// extension. The obvious way to add degradation (copy CodeEditor, which empties
// its whole extension array) would therefore strip undo from exactly the large
// files where losing edits hurts most. These tests fail if someone does that.

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { LARGE_TEXT_VIEWER_THRESHOLD } from '@/renderer/pages/conversation/Preview/constants';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import HTMLEditor from '@/renderer/pages/conversation/Preview/components/editors/HTMLEditor';
import MarkdownEditor from '@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor';

afterEach(() => vi.clearAllMocks());

/** Body comfortably past the degradation threshold. */
const large = (unit: string) => unit.repeat(Math.ceil((LARGE_TEXT_VIEWER_THRESHOLD + 1000) / unit.length));

/**
 * Reach the live EditorView behind the React wrapper. Needed because undo is a
 * CodeMirror command over editor state: a synthetic keydown does not run the
 * keymap under jsdom, so asserting on keystrokes would pass even with history
 * removed — which is exactly the bug being guarded against.
 */
const viewOf = (container: HTMLElement): EditorView => {
  const content = container.querySelector('.cm-content') as HTMLElement | null;
  expect(content).not.toBeNull();
  const view = EditorView.findFromDOM(content as HTMLElement);
  expect(view).not.toBeNull();
  return view as EditorView;
};

/** Type into the doc, then undo. Returns whether the original text came back. */
const undoRestoresDoc = (container: HTMLElement): boolean => {
  const view = viewOf(container);
  const before = view.state.doc.toString();

  view.dispatch({ changes: { from: 0, insert: 'TYPED' } });
  expect(view.state.doc.toString()).not.toBe(before); // edit landed

  const handled = undo(view);
  return handled && view.state.doc.toString() === before;
};

describe('HTMLEditor large-file degradation', () => {
  it('renders a small document with folding available', () => {
    const { container } = render(<HTMLEditor value={'<p>hi</p>'} onChange={() => {}} />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    // Fold gutter present while the syntax tree is in play.
    expect(container.querySelector('.cm-foldGutter')).not.toBeNull();
  });

  it('drops folding for a large document', () => {
    const { container } = render(<HTMLEditor value={large('<p>x</p>\n')} onChange={() => {}} />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.querySelector('.cm-foldGutter')).toBeNull();
  });

  // The regression guard. HTMLEditor turns basicSetup's history off and brings
  // its own, so degradation must drop only html(). Emptying the extension array
  // (the shape CodeEditor uses, where basicSetup still owns history) would strip
  // undo from precisely the large files where losing edits hurts most.
  it('keeps undo working on a large document', () => {
    const { container } = render(<HTMLEditor value={large('<p>x</p>\n')} onChange={() => {}} />);
    expect(undoRestoresDoc(container)).toBe(true);
  });

  it('keeps undo working on a small document too', () => {
    const { container } = render(<HTMLEditor value={'<p>hi</p>'} onChange={() => {}} />);
    expect(undoRestoresDoc(container)).toBe(true);
  });

  it('keeps line numbers on a large document', () => {
    const { container } = render(<HTMLEditor value={large('<p>x</p>\n')} onChange={() => {}} />);
    expect(container.querySelector('.cm-lineNumbers')).not.toBeNull();
  });
});

describe('MarkdownEditor large-file degradation', () => {
  it('renders a small document with folding available', () => {
    const { container } = render(<MarkdownEditor value={'# hi'} onChange={() => {}} />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.querySelector('.cm-foldGutter')).not.toBeNull();
  });

  it('drops folding for a large document', () => {
    const { container } = render(<MarkdownEditor value={large('# heading\n\nbody text\n\n')} onChange={() => {}} />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.querySelector('.cm-foldGutter')).toBeNull();
  });

  it('keeps line numbers and stays mounted on a large document', () => {
    const { container } = render(<MarkdownEditor value={large('# heading\n\nbody\n\n')} onChange={() => {}} />);
    expect(container.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(container.querySelector('.cm-content')).not.toBeNull();
  });

  // `readOnly` is enforced by a CodeMirror state facet, not by the
  // contenteditable attribute (which stays "true" either way — verified against
  // the untouched CodeEditor too). So assert on behaviour: a read-only editor
  // reports no edits through onChange.
  it('honours readOnly on a large document', () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownEditor value={large('# h\n\nbody\n\n')} onChange={onChange} readOnly />);
    const editable = container.querySelector('.cm-content') as HTMLElement;

    fireEvent.input(editable, { target: { textContent: 'typed' } });

    expect(onChange).not.toHaveBeenCalled();
  });
});
