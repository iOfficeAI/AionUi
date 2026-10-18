/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@icon-park/react', () => ({ Left: () => null, Right: () => null, Refresh: () => null, Loading: () => null }));
vi.mock('@/common', () => ({ ipcBridge: { application: {} } }));

import WebviewHost from '@/renderer/components/media/WebviewHost';

let guest: JSDOM | undefined;

afterEach(() => {
  cleanup();
  guest?.window.close();
  guest = undefined;
  vi.restoreAllMocks();
});

function openPage(html: string) {
  const page = new JSDOM(html, { url: 'https://login.example.test/', runScripts: 'outside-only' });
  guest = page;
  const navigate = vi.spyOn(page.window, 'postMessage').mockImplementation(() => {});
  const { container } = render(<WebviewHost url='https://login.example.test/' />);
  const webview = container.querySelector('webview');
  if (!webview) throw new Error('Webview was not mounted');
  Object.assign(webview, {
    executeJavaScript: vi.fn(async (script: string) => page.window.eval(script)),
    canGoBack: () => false,
    canGoForward: () => false,
  });
  act(() => webview.dispatchEvent(new Event('dom-ready')));
  return { page: page.window, navigate };
}

describe('WebviewHost form navigation', () => {
  it('lets login POST forms submit natively with their credentials and CSRF fields', () => {
    const { page, navigate } = openPage(
      '<form method="post" action="/authenticate"><input name="username" value="test-user"><input name="csrf" value="test-csrf"><button>Sign in</button></form>'
    );
    const form = page.document.querySelector('form')!;
    const submit = new page.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves GET form serialization to the browser instead of dropping query fields', () => {
    const { page, navigate } = openPage('<form method="get" action="/search"><input name="q" value="example"></form>');
    const submit = new page.Event('submit', { bubbles: true, cancelable: true });
    page.document.querySelector('form')!.dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('preserves native submission when a button overrides the form action and method', () => {
    const { page, navigate } = openPage(
      '<form action="/default"><button formaction="/alternate" formmethod="post" name="action" value="login">Sign in</button></form>'
    );
    const form = page.document.querySelector('form')!;
    const submit = new page.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter: form.querySelector('button'),
    });
    form.dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('allows the page to cancel its own JavaScript-managed submission', () => {
    const { page, navigate } = openPage('<form method="post" action="/authenticate"></form>');
    const form = page.document.querySelector('form')!;
    form.addEventListener('submit', (event) => event.preventDefault());
    const submit = new page.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still routes HTTP links through the host navigation bridge', () => {
    const { page, navigate } = openPage('<a href="/next">Continue</a>');
    page.document.querySelector('a')!.dispatchEvent(new page.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(navigate).toHaveBeenCalledWith(
      { type: '__WEBVIEW_HOST_NAVIGATE__', url: 'https://login.example.test/next' },
      '*'
    );
  });
});
