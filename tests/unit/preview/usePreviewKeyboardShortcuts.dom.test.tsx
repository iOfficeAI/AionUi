/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cmd/Ctrl+W is a system-level "close", so the risk here is not that the
 * shortcut fails to fire but that it fires when it should not — closing a
 * preview tab because the user pressed it while typing in the chat box would be
 * baffling. These pin the scope rule, the modifier matching, and the deliberate
 * decision NOT to yield to the code editor inside the panel.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isMacOSMock } = vi.hoisted(() => ({ isMacOSMock: vi.fn(() => true) }));

vi.mock('@/renderer/utils/platform', () => ({ isMacOS: isMacOSMock }));

import { usePreviewKeyboardShortcuts } from '@renderer/pages/conversation/Preview/hooks/usePreviewKeyboardShortcuts';

let scope: HTMLDivElement;
let outside: HTMLDivElement;

const scopeRef = (): React.RefObject<HTMLElement | null> => ({ current: scope });

const press = (target: HTMLElement, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  isMacOSMock.mockReturnValue(true);
  scope = document.createElement('div');
  outside = document.createElement('div');
  document.body.append(scope, outside);
});

afterEach(() => {
  scope.remove();
  outside.remove();
  vi.clearAllMocks();
});

describe('usePreviewKeyboardShortcuts — close active tab', () => {
  it('closes the active tab on Cmd+W inside the panel', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(scope, { key: 'w', metaKey: true });

    expect(onCloseActiveTab).toHaveBeenCalledTimes(1);
  });

  it('leaves the keystroke alone when it comes from outside the panel', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    const event = press(outside, { key: 'w', metaKey: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('fires from a nested element, not just the panel root', () => {
    const onCloseActiveTab = vi.fn();
    const child = document.createElement('span');
    scope.appendChild(child);
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(child, { key: 'w', metaKey: true });

    expect(onCloseActiveTab).toHaveBeenCalledTimes(1);
  });

  it('still fires while the code editor has focus — the close confirmation guards unsaved edits', () => {
    const onCloseActiveTab = vi.fn();
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    scope.appendChild(editor);
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(editor, { key: 'w', metaKey: true });

    expect(onCloseActiveTab).toHaveBeenCalledTimes(1);
  });

  it('swallows the default so the key does not also reach the host', () => {
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab: vi.fn(), scopeRef: scopeRef() }));

    const event = press(scope, { key: 'w', metaKey: true });

    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing when the panel supplies no close handler', () => {
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), scopeRef: scopeRef() }));

    const event = press(scope, { key: 'w', metaKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing when the panel root is not mounted', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: { current: null } }));

    press(scope, { key: 'w', metaKey: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });

  it('ignores Ctrl+W on macOS, where Ctrl is not the primary modifier', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(scope, { key: 'w', ctrlKey: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });

  it('accepts Ctrl+W off macOS', () => {
    isMacOSMock.mockReturnValue(false);
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(scope, { key: 'w', ctrlKey: true });

    expect(onCloseActiveTab).toHaveBeenCalledTimes(1);
  });

  it('ignores chords that merely contain W', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(scope, { key: 'w', metaKey: true, shiftKey: true });
    press(scope, { key: 'w', metaKey: true, altKey: true });
    press(scope, { key: 'w' });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });

  it('ignores auto-repeat so holding the keys does not close a run of tabs', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() }));

    press(scope, { key: 'w', metaKey: true, repeat: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });

  it('stops listening once the panel unmounts', () => {
    const onCloseActiveTab = vi.fn();
    const { unmount } = renderHook(() =>
      usePreviewKeyboardShortcuts({ onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() })
    );

    unmount();
    press(scope, { key: 'w', metaKey: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });
});

describe('usePreviewKeyboardShortcuts — save', () => {
  it('saves on Cmd+S when the tab is dirty', () => {
    const onSave = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ isDirty: true, onSave }));

    press(scope, { key: 's', metaKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not save a tab with nothing to write', () => {
    const onSave = vi.fn();
    renderHook(() => usePreviewKeyboardShortcuts({ isDirty: false, onSave }));

    press(scope, { key: 's', metaKey: true });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('never lets Cmd+S reach the browser save dialog', () => {
    renderHook(() => usePreviewKeyboardShortcuts({ isDirty: false, onSave: vi.fn() }));

    const event = press(scope, { key: 's', metaKey: true });

    expect(event.defaultPrevented).toBe(true);
  });

  it('does not close a tab when the save shortcut is pressed', () => {
    const onCloseActiveTab = vi.fn();
    renderHook(() =>
      usePreviewKeyboardShortcuts({ isDirty: true, onSave: vi.fn(), onCloseActiveTab, scopeRef: scopeRef() })
    );

    press(scope, { key: 's', metaKey: true });

    expect(onCloseActiveTab).not.toHaveBeenCalled();
  });
});
