/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  buildDetachedConversationHash,
  buildDetachedConversationUrl,
  getAppLayoutMode,
  getDetachedConversationId,
  isDetachedWindowSearch,
} from '@/common/platform/detachedWindow';

describe('detached conversation URL', () => {
  it('builds an encoded HashRouter URL without replacing the served base path', () => {
    expect(buildDetachedConversationHash('agent/with spaces')).toBe(
      '#/conversation/agent%2Fwith%20spaces?window=detached'
    );
    expect(buildDetachedConversationUrl('https://mini.example/aion/#/guid', 'conversation-1')).toBe(
      'https://mini.example/aion/#/conversation/conversation-1?window=detached'
    );
  });

  it('recognizes only the explicit detached flag', () => {
    expect(isDetachedWindowSearch('?window=detached')).toBe(true);
    expect(isDetachedWindowSearch('?source=sidebar&window=detached')).toBe(true);
    expect(isDetachedWindowSearch('')).toBe(false);
    expect(isDetachedWindowSearch('?window=main')).toBe(false);
  });
});

describe('app layout mode', () => {
  it('selects the chrome-less layout only for detached routes', () => {
    expect(getAppLayoutMode('?window=detached')).toBe('detached');
    expect(getAppLayoutMode('')).toBe('standard');
  });

  it('extracts only a valid detached conversation route', () => {
    expect(getDetachedConversationId('/conversation/a%20b', '?window=detached')).toBe('a b');
    expect(getDetachedConversationId('/settings', '?window=detached')).toBeNull();
    expect(getDetachedConversationId('/conversation/%', '?window=detached')).toBeNull();
    expect(getDetachedConversationId('/conversation/a', '')).toBeNull();
  });
});
