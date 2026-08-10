/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  SINGLE_BROWSER_CONTEXT_ID,
  SINGLE_SESSION_ID,
  SINGLE_TARGET_ID,
  buildListPayload,
  buildTargetInfo,
  buildVersionPayload,
  decideCdpCommand,
  isAcceptableSessionId,
  tokensMatch,
} from '@process/resources/builtinMcp/cdpTargetProtocol';

const targetInfo = () => buildTargetInfo('Example', 'https://example.com/');

describe('cdpTargetProtocol — discovery payloads', () => {
  it('exposes webSocketDebuggerUrl, which is the only field puppeteer reads from /json/version', () => {
    const payload = buildVersionPayload('ws://127.0.0.1:1234/x', '120.0.0.0');
    expect(payload.webSocketDebuggerUrl).toBe('ws://127.0.0.1:1234/x');
    expect(payload.Browser).toContain('Chrome/');
  });

  it('reports exactly one page in /json/list', () => {
    const list = buildListPayload('ws://127.0.0.1:1234/x', 'Example', 'https://example.com/');
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('page');
    expect(list[0].id).toBe(SINGLE_TARGET_ID);
  });
});

describe('cdpTargetProtocol — Target.* handled locally', () => {
  it('backfills targetCreated when discovery is turned on, which is what unblocks puppeteer initialize()', () => {
    const decision = decideCdpCommand(
      { id: 1, method: 'Target.setDiscoverTargets', params: { discover: true } },
      targetInfo
    );
    expect(decision.kind).toBe('reply-and-emit');
    if (decision.kind !== 'reply-and-emit') return;
    expect(decision.emit).toHaveLength(1);
    expect(decision.emit[0].method).toBe('Target.targetCreated');
  });

  it('does not backfill when discovery is turned off', () => {
    const decision = decideCdpCommand(
      { id: 1, method: 'Target.setDiscoverTargets', params: { discover: false } },
      targetInfo
    );
    expect(decision.kind).toBe('reply');
  });

  it('returns a sessionId and emits attachedToTarget so flatten-mode routing works', () => {
    const decision = decideCdpCommand(
      { id: 2, method: 'Target.attachToTarget', params: { targetId: SINGLE_TARGET_ID, flatten: true } },
      targetInfo
    );
    expect(decision.kind).toBe('reply-and-emit');
    if (decision.kind !== 'reply-and-emit') return;
    expect(decision.payload.sessionId).toBe(SINGLE_SESSION_ID);
    expect(decision.emit[0].method).toBe('Target.attachedToTarget');
  });

  it('rejects attaching to an unknown target rather than silently using the only one', () => {
    const decision = decideCdpCommand(
      { id: 3, method: 'Target.attachToTarget', params: { targetId: 'someone-elses-page' } },
      targetInfo
    );
    expect(decision.kind).toBe('error');
  });

  it('reports a single target and a single browser context', () => {
    const targets = decideCdpCommand({ id: 4, method: 'Target.getTargets' }, targetInfo);
    expect(targets.kind).toBe('reply');
    if (targets.kind === 'reply') {
      expect(targets.payload.targetInfos).toHaveLength(1);
    }

    const contexts = decideCdpCommand({ id: 5, method: 'Target.getBrowserContexts' }, targetInfo);
    if (contexts.kind === 'reply') {
      expect(contexts.payload.browserContextIds).toEqual([SINGLE_BROWSER_CONTEXT_ID]);
    }
  });

  it('backfills attachment on the browser-level setAutoAttach', () => {
    // Verified against real puppeteer: acknowledging alone leaves browser.pages() at 0,
    // because only the attachedToTarget event marks a target as available.
    const decision = decideCdpCommand(
      {
        id: 6,
        method: 'Target.setAutoAttach',
        params: { autoAttach: true, flatten: true, filter: [{ type: 'page', exclude: true }] },
      },
      targetInfo
    );
    expect(decision.kind).toBe('reply-and-emit');
  });
});

describe('cdpTargetProtocol — refusals that protect the app', () => {
  it('errors on createTarget instead of pretending a new tab was opened', () => {
    // Silently returning the existing targetId would leave the agent driving the old
    // page while believing it had a new one.
    const decision = decideCdpCommand(
      { id: 7, method: 'Target.createTarget', params: { url: 'https://example.com' } },
      targetInfo
    );
    expect(decision.kind).toBe('error');
  });

  it('refuses Browser.close, which would terminate the whole application', () => {
    const decision = decideCdpCommand({ id: 8, method: 'Browser.close' }, targetInfo);
    expect(decision.kind).toBe('error');
  });

  it('refuses additional browser contexts', () => {
    expect(decideCdpCommand({ id: 9, method: 'Target.createBrowserContext' }, targetInfo).kind).toBe('error');
  });
});

describe('cdpTargetProtocol — forwarding', () => {
  it.each([
    'Page.navigate',
    'Runtime.evaluate',
    'DOM.getDocument',
    'Accessibility.getFullAXTree',
    'Input.dispatchMouseEvent',
  ])('forwards %s to the real debugger', (method) => {
    expect(decideCdpCommand({ id: 10, method }, targetInfo).kind).toBe('forward');
  });
});

describe('cdpTargetProtocol — session routing', () => {
  it('accepts browser-level (absent/empty) and our own page session', () => {
    expect(isAcceptableSessionId(undefined)).toBe(true);
    expect(isAcceptableSessionId('')).toBe(true);
    expect(isAcceptableSessionId(SINGLE_SESSION_ID)).toBe(true);
  });

  it('rejects a foreign sessionId rather than treating it as browser-level', () => {
    expect(isAcceptableSessionId('some-other-session')).toBe(false);
  });
});

describe('cdpTargetProtocol — token comparison', () => {
  it('matches identical tokens and rejects differences', () => {
    expect(tokensMatch('abc123', 'abc123')).toBe(true);
    expect(tokensMatch('abc123', 'abc124')).toBe(false);
  });

  it('rejects a correct prefix, so a shorter guess cannot pass', () => {
    expect(tokensMatch('abc123', 'abc')).toBe(false);
    expect(tokensMatch('abc', 'abc123')).toBe(false);
  });

  it('rejects an empty candidate against a real token', () => {
    expect(tokensMatch('realtoken', '')).toBe(false);
  });
});

/**
 * 以下三条来自用真实 puppeteer-core 跑集成验证时踩到的坑，固化成回归测试。
 * Regression tests for three bugs found while verifying against real puppeteer-core.
 */
describe('cdpTargetProtocol — regressions found against real puppeteer', () => {
  it('backfills attachedToTarget on the browser-level setAutoAttach, or browser.pages() stays empty', () => {
    // getAvailableTargets() reads #attachedTargetsByTargetId, which only the
    // attachedToTarget event populates — targetCreated alone is not enough.
    const decision = decideCdpCommand(
      { id: 1, method: 'Target.setAutoAttach', params: { autoAttach: true, flatten: true } },
      targetInfo
    );
    expect(decision.kind).toBe('reply-and-emit');
    if (decision.kind !== 'reply-and-emit') return;
    expect(decision.emit.map((e) => e.method)).toContain('Target.attachedToTarget');
  });

  it('does NOT backfill on a session-scoped setAutoAttach, which would loop forever', () => {
    // puppeteer answers attachedToTarget by issuing setAutoAttach on the new session;
    // backfilling there produced setAutoAttach -> attachedToTarget -> setAutoAttach ...
    // and the connection never finished initialising.
    const decision = decideCdpCommand(
      {
        id: 2,
        method: 'Target.setAutoAttach',
        params: { autoAttach: true, flatten: true },
        sessionId: SINGLE_SESSION_ID,
      },
      targetInfo
    );
    expect(decision.kind).toBe('reply');
  });

  it('reports a non-empty url, since PageTarget stays uninitialised while url is empty', () => {
    // PageTarget._checkIfInitialized() only resolves once targetInfo.url !== ''.
    const info = buildTargetInfo('', 'https://example.com/');
    expect(info.url).not.toBe('');
  });
});
