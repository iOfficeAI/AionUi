/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

import { createDetachedWindowActions } from '@/renderer/utils/ui/detachedWindow';
import { isOwnWindowMaximizeEvent } from '@/renderer/components/layout/WindowControls';

describe('detached window actions', () => {
  it('ignores maximize broadcasts when a browser host has no Electron window id', () => {
    expect(isOwnWindowMaximizeEvent(null, 1)).toBe(false);
    expect(isOwnWindowMaximizeEvent(2, 1)).toBe(false);
    expect(isOwnWindowMaximizeEvent(1, 1)).toBe(true);
  });

  it('opens a sized browser popup in WebUI mode and focuses it on a repeated request', async () => {
    const popup = { closed: false, focus: vi.fn() };
    const openBrowserWindow = vi.fn(() => popup);
    const openElectronWindow = vi.fn(() => Promise.resolve());
    const actions = createDetachedWindowActions({
      isWebUiBrowserMode: () => true,
      getCurrentUrl: () => 'https://mini.example/aion/#/guid',
      openBrowserWindow,
      openElectronWindow,
      focusElectronWindow: vi.fn(() => Promise.resolve(false)),
    });

    await actions.openConversation('conversation-1');
    await actions.openConversation('conversation-1');

    expect(openBrowserWindow).toHaveBeenCalledOnce();
    expect(openBrowserWindow).toHaveBeenCalledWith(
      'https://mini.example/aion/#/conversation/conversation-1?window=detached',
      'aionui-conversation-conversation-1',
      expect.stringContaining('width=1000')
    );
    expect(popup.focus).toHaveBeenCalledOnce();
    expect(openElectronWindow).not.toHaveBeenCalled();
  });

  it('forgets a closed browser popup so the sidebar can navigate normally', async () => {
    const popup = { closed: true, focus: vi.fn() };
    const actions = createDetachedWindowActions({
      isWebUiBrowserMode: () => true,
      getCurrentUrl: () => 'https://mini.example/#/guid',
      openBrowserWindow: vi.fn(() => popup),
      openElectronWindow: vi.fn(() => Promise.resolve()),
      focusElectronWindow: vi.fn(() => Promise.resolve(false)),
    });

    await actions.openConversation('conversation-1');

    await expect(actions.focusConversation('conversation-1')).resolves.toBe(false);
    expect(popup.focus).not.toHaveBeenCalled();
  });

  it('uses the typed bridge instead of window.open in Electron', async () => {
    const openElectronWindow = vi.fn(() => Promise.resolve());
    const focusElectronWindow = vi.fn(() => Promise.resolve(true));
    const openBrowserWindow = vi.fn();
    const actions = createDetachedWindowActions({
      isWebUiBrowserMode: () => false,
      getCurrentUrl: () => 'file:///app/index.html#/guid',
      openBrowserWindow,
      openElectronWindow,
      focusElectronWindow,
    });

    await actions.openConversation('conversation-1');
    await expect(actions.focusConversation('conversation-1')).resolves.toBe(true);

    expect(openElectronWindow).toHaveBeenCalledWith('conversation-1');
    expect(focusElectronWindow).toHaveBeenCalledWith('conversation-1');
    expect(openBrowserWindow).not.toHaveBeenCalled();
  });

  it('rejects when the browser blocks the popup', async () => {
    const actions = createDetachedWindowActions({
      isWebUiBrowserMode: () => true,
      getCurrentUrl: () => 'https://mini.example/#/guid',
      openBrowserWindow: vi.fn(() => null),
      openElectronWindow: vi.fn(() => Promise.resolve()),
      focusElectronWindow: vi.fn(() => Promise.resolve(false)),
    });

    await expect(actions.openConversation('conversation-1')).rejects.toThrow('blocked');
  });
});
