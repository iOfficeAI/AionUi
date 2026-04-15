import { beforeEach, describe, expect, it } from 'vitest';

import { clearHistoryStatePreservingUrl } from '../../../src/renderer/pages/guid/utils/historyState';

describe('clearHistoryStatePreservingUrl', () => {
  beforeEach(() => {
    window.history.replaceState({ resetAssistant: true }, '', '/#/guid');
  });

  it('clears history state without rewriting the current hash-router url', () => {
    const beforeHref = window.location.href;
    const beforePathname = window.location.pathname;
    const beforeHash = window.location.hash;

    clearHistoryStatePreservingUrl();

    expect(window.location.href).toBe(beforeHref);
    expect(window.location.pathname).toBe(beforePathname);
    expect(window.location.hash).toBe(beforeHash);
    expect(window.history.state).toBeNull();
  });
});
