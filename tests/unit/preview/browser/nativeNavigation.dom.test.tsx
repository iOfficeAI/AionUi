/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@icon-park/react', () => ({ Left: () => null, Right: () => null, Refresh: () => null, Loading: () => null }));
vi.mock('@/common', () => ({ ipcBridge: { application: {} } }));

import WebviewHost from '@/renderer/components/media/WebviewHost';

afterEach(cleanup);

const initialUrl = 'https://login.example.test/authorize';

function openBrowser() {
  const onUrlChange = vi.fn();
  const view = render(<WebviewHost url={initialUrl} onUrlChange={onUrlChange} />);
  const webview = view.container.querySelector('webview');
  if (!webview) throw new Error('Webview was not mounted');
  // Reflect imperative navigations like Electron's custom element does.
  Object.defineProperty(webview, 'src', {
    configurable: true,
    get: () => webview.getAttribute('src'),
    set: (value: string) => webview.setAttribute('src', value),
  });
  return { ...view, webview, onUrlChange };
}

function navigate(webview: Element, url: string, type = 'did-navigate') {
  act(() => webview.dispatchEvent(Object.assign(new Event(type), { url })));
}

describe('WebviewHost native navigation', () => {
  it('reports a native redirect without loading its callback URL again', () => {
    const { webview, onUrlChange } = openBrowser();
    const callback = 'https://app.example.test/callback?code=fixture-code';
    navigate(webview, callback);

    expect(onUrlChange).toHaveBeenLastCalledWith(callback);
    expect(webview.getAttribute('src')).toBe(initialUrl);
  });

  it('does not reload when an OAuth page removes its callback parameters with replaceState', () => {
    const { webview, onUrlChange } = openBrowser();
    navigate(webview, 'https://app.example.test/callback?code=fixture-code');
    navigate(webview, 'https://app.example.test/callback', 'did-navigate-in-page');

    expect(onUrlChange).toHaveBeenLastCalledWith('https://app.example.test/callback');
    expect(webview.getAttribute('src')).toBe(initialUrl);
  });

  it('does not reload a native redirect when the parent persists and echoes its address', () => {
    const { webview, onUrlChange, rerender } = openBrowser();
    const callback = 'https://app.example.test/callback?code=fixture-code';
    navigate(webview, callback);
    rerender(<WebviewHost url={callback} onUrlChange={onUrlChange} />);

    expect(webview.getAttribute('src')).toBe(initialUrl);
  });

  it('still navigates when the parent intentionally supplies a different address', () => {
    const { webview, onUrlChange, rerender } = openBrowser();
    navigate(webview, 'https://app.example.test/callback');
    const next = 'https://other.example.test/';
    rerender(<WebviewHost url={next} onUrlChange={onUrlChange} />);

    expect(webview.getAttribute('src')).toBe(next);
  });
});
