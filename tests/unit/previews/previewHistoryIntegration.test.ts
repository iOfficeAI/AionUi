/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * N4c V12: preview-history integration smoke test.
 * Uses mockHttpBridge helper to demonstrate stubbing /api/preview-history routes.
 */

import { describe, it, expect } from 'vitest';
import { createMockHttpBridge } from '../_helpers/mockHttpBridge';

describe('previewHistory integration (mockHttpBridge demo)', () => {
  it('registers GET /api/preview-history/list and returns stub data', async () => {
    const mock = createMockHttpBridge({ unmatched: 'warn' });
    mock.onGet('/api/preview-history/list', () => ({
      items: [{ id: 1, file_path: '/tmp/a.md' }],
    }));

    const { httpGet } = mock.asModule();
    const res = await httpGet<{ items: Array<{ id: number; file_path: string }> }>(
      '/api/preview-history/list'
    ).invoke();
    expect(res).toEqual({ items: [{ id: 1, file_path: '/tmp/a.md' }] });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.method).toBe('GET');
  });

  it('registers POST /api/preview-history/save and echoes body', async () => {
    const mock = createMockHttpBridge();
    mock.onPost<{ content: string }, { id: number }>('/api/preview-history/save', (ctx) => ({
      id: 42,
      echoed: ctx.body?.content ?? null,
    }));
    const { httpPost } = mock.asModule();
    const res = await httpPost<{ content: string }, { id: number }>('/api/preview-history/save').invoke({
      content: 'hello',
    });
    expect(res).toBeTruthy();
    expect(mock.calls[0]?.body).toEqual({ content: 'hello' });
    expect(mock.calls[0]?.method).toBe('POST');
  });

  it('reset() clears prior routes and call history', () => {
    const mock = createMockHttpBridge();
    mock.onGet('/api/preview-history/list', () => ({ items: [] }));
    expect(mock.routeCount).toBe(1);
    mock.reset();
    expect(mock.routeCount).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });
});
