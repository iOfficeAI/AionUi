/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Focused regression tests for ipcBridge runtime-stability fixes.
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acpConversation, conversation, fileSnapshot } from '@/common/adapter/ipcBridge';

describe('ipcBridge runtime stability regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes confirmation call ids when confirming messages', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await conversation.confirmMessage.invoke({
      conversation_id: 'conv-1',
      call_id: 'tool/call?id=1',
      confirm_key: 'allow',
      msg_id: 'msg-1',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      '/api/conversations/conv-1/confirmations/tool%2Fcall%3Fid%3D1/confirm'
    );
  });

  it('maps file snapshot compare results with relative_path fallback', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            staged: [{ file_path: '/repo/a.ts', relative_path: 'src/a.ts', operation: 'modified' }],
            unstaged: [{ file_path: '/repo/b.ts', relativePath: 'src/b.ts', operation: 'added' }],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fileSnapshot.compare.invoke({ workspace: '/repo' });

    expect(result).toEqual({
      staged: [{ file_path: '/repo/a.ts', relativePath: 'src/a.ts', operation: 'modified' }],
      unstaged: [{ file_path: '/repo/b.ts', relativePath: 'src/b.ts', operation: 'added' }],
    });
  });

  it('silences ACP mode/model 404s so callers can handle them upstream', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchSpy);
    const errorSpy = vi.spyOn(console, 'error');

    await expect(acpConversation.getMode.invoke({ conversation_id: 'conv-404' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(acpConversation.getModel.invoke({ conversation_id: 'conv-404' })).rejects.toMatchObject({
      status: 404,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
