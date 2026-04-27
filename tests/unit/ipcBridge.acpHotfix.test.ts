/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acpConversation } from '../../src/common/adapter/ipcBridge';

describe('ipcBridge.acpConversation — wire body uses snake_case', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ data: null }),
        } as unknown as Response;
      })
    );
  });

  it('setModel sends {model_id} not {modelId}', async () => {
    await acpConversation.setModel.invoke({ conversation_id: 'c1', model_id: 'claude-sonnet-4' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ model_id: 'claude-sonnet-4' });
    expect(body).not.toHaveProperty('modelId');
  });

  it('setConfigOption sends snake_case body keys (value only; configId is URL path)', async () => {
    await acpConversation.setConfigOption.invoke({
      conversation_id: 'c1',
      config_id: 'temperature',
      value: '0.5',
    });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ value: '0.5' });
    expect(body).not.toHaveProperty('configId');
    expect(body).not.toHaveProperty('config_id');
  });
});
