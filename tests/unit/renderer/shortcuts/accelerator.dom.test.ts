import { describe, expect, it } from 'vitest';
import {
  acceleratorFromKeyboardEvent,
  isEditableShortcutTarget,
  matchesAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  toHotkeysPattern,
} from '@/renderer/shortcuts/accelerator';

const keyEvent = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init);

describe('shortcut accelerator utilities', () => {
  it('normalizes accelerators into canonical modifier order', () => {
    expect(normalizeAccelerator('Shift+Ctrl+t')).toBe('Ctrl+Shift+t');
    expect(normalizeAccelerator('CtrlOrCmd+,')).toMatch(/^(Ctrl|Meta)\+,$/);
    expect(normalizeAccelerator('Ctrl+Plus')).toBe('Ctrl+Plus');
  });

  it('converts accelerators to hotkeys-js patterns', () => {
    expect(toHotkeysPattern('CtrlOrCmd+,')).toMatch(/^(ctrl|command)\+,$/);
    expect(toHotkeysPattern('CtrlOrCmd+;')).toMatch(/^(ctrl|command)\+;$/);
    expect(toHotkeysPattern('Ctrl+Shift+Tab')).toBe('ctrl+shift+tab');
    expect(toHotkeysPattern('Ctrl+Plus')).toBe('ctrl+plus');
  });

  it('builds editable accelerators from keyboard events', () => {
    expect(acceleratorFromKeyboardEvent(keyEvent({ ctrlKey: true, key: 'p' }))).toBe('CtrlOrCmd+p');
    expect(acceleratorFromKeyboardEvent(keyEvent({ metaKey: true, shiftKey: true, key: 'T' }))).toBe(
      'CtrlOrCmd+Shift+t'
    );
    expect(acceleratorFromKeyboardEvent(keyEvent({ altKey: true, key: 'ArrowDown' }))).toBe('Alt+ArrowDown');
    expect(acceleratorFromKeyboardEvent(keyEvent({ ctrlKey: true, key: 'Control' }))).toBeNull();
  });

  it('rejects accelerators with multiple primary keys', () => {
    expect(parseAccelerator('Ctrl+T+P')).toBeNull();
  });

  it('matches Ctrl+Tab and Ctrl+Shift+Tab exactly', () => {
    expect(matchesAccelerator(keyEvent({ ctrlKey: true, key: 'Tab' }), 'Ctrl+Tab')).toBe(true);
    expect(matchesAccelerator(keyEvent({ ctrlKey: true, shiftKey: true, key: 'Tab' }), 'Ctrl+Tab')).toBe(false);
    expect(matchesAccelerator(keyEvent({ ctrlKey: true, shiftKey: true, key: 'Tab' }), 'Ctrl+Shift+Tab')).toBe(true);
  });

  it('matches shifted punctuation keys by produced character', () => {
    expect(matchesAccelerator(keyEvent({ ctrlKey: true, shiftKey: true, key: '?' }), 'Ctrl+Shift+/')).toBe(true);
    expect(matchesAccelerator(keyEvent({ ctrlKey: true, shiftKey: true, key: '_' }), 'Ctrl+Shift+-')).toBe(true);
  });

  it('detects editable shortcut targets', () => {
    const input = document.createElement('input');
    const plaintextEditor = document.createElement('div');
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    plaintextEditor.setAttribute('contenteditable', 'plaintext-only');
    const plain = document.createElement('button');

    document.body.append(input, plaintextEditor, editor, plain);

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(plaintextEditor)).toBe(true);
    expect(isEditableShortcutTarget(editor)).toBe(true);
    expect(isEditableShortcutTarget(plain)).toBe(false);

    input.remove();
    plaintextEditor.remove();
    editor.remove();
    plain.remove();
  });
});
