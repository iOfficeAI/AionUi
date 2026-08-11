/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_JS_FILTER_SCRIPT } from '../../src/common/apiCallback';
import { CallbackService } from '../../src/webserver/services/CallbackService';

describe('CallbackService.createTemplateVariables', () => {
  const baseConfig = {
    id: 1,
    enabled: true,
    callbackEnabled: true,
    callbackMethod: 'POST' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty jsFitterStr when JS filter is disabled', () => {
    const variables = CallbackService.createTemplateVariables(
      {
        ...baseConfig,
        jsFilterEnabled: false,
      },
      {
        sessionId: 'session-1',
        workspace: 'workspace-1',
      }
    );

    expect(variables.jsFitterStr).toBe('');
  });

  it('runs the default JS filter and keeps only the last 1024 characters', () => {
    const longHistory = Array.from({ length: 400 }, (_, index) => `message-${index}`).join('');
    const variables = CallbackService.createTemplateVariables(
      {
        ...baseConfig,
        jsFilterEnabled: true,
        jsFilterScript: DEFAULT_JS_FILTER_SCRIPT,
      },
      {
        sessionId: 'session-1',
        workspace: 'workspace-1',
        model: { id: 'provider-1', useModel: 'gpt-test' },
        lastMessage: { content: longHistory },
        conversationHistory: [{ id: '1', content: longHistory }],
      }
    );

    expect(typeof variables.jsFitterStr).toBe('string');
    expect((variables.jsFitterStr as string).length).toBeLessThanOrEqual(1024);
    expect(variables.jsFitterTextLimit).toBe(-1);
  });

  it('falls back to empty jsFitterStr when the user script is invalid', () => {
    const variables = CallbackService.createTemplateVariables(
      {
        ...baseConfig,
        jsFilterEnabled: true,
        jsFilterScript: 'function nope() { return "x"; }',
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(variables.jsFitterStr).toBe('');
    expect(variables.jsFitterTextLimit).toBe(-1);
  });

  it('supports object return values from the JS filter', () => {
    const variables = CallbackService.createTemplateVariables(
      {
        ...baseConfig,
        jsFilterEnabled: true,
        jsFilterScript: `function jsFilter() {
  return {
    content: 'hello world',
    textLimit: 100,
  };
}`,
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(variables.jsFitterStr).toBe('hello world');
    expect(variables.jsFitterFullStr).toBe('hello world');
    expect(variables.jsFitterTextLimit).toBe(100);
    expect(variables.jsFitterChunkIndex).toBe(1);
    expect(variables.jsFitterChunkCount).toBe(1);
  });
});

describe('CallbackService.sendCallback', () => {
  const baseConfig = {
    id: 1,
    enabled: true,
    callbackEnabled: true,
    callbackUrl: 'https://example.com/webhook',
    callbackMethod: 'POST' as const,
    callbackBody:
      '{"message":"{{jsFitterStr}}","full":"{{jsFitterFullStr}}","index":{{jsFitterChunkIndex}},"count":{{jsFitterChunkCount}}}',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('splits callback messages when the JS filter returns a positive textLimit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await CallbackService.sendCallback(
      {
        ...baseConfig,
        jsFilterEnabled: true,
        jsFilterScript: `function jsFilter() {
  return {
    content: '1234567890',
    textLimit: 4,
  };
}`,
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"message":"1234"');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"message":"5678"');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('"message":"90"');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"full":"1234567890"');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('"index":3');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('"count":3');
  });

  it('keeps a single callback request when textLimit is -1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await CallbackService.sendCallback(
      {
        ...baseConfig,
        jsFilterEnabled: true,
        jsFilterScript: `function jsFilter() {
  return {
    content: '1234567890',
    textLimit: -1,
  };
}`,
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"message":"1234567890"');
  });

  it('keeps backward compatibility for string return values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await CallbackService.sendCallback(
      {
        ...baseConfig,
        jsFilterEnabled: true,
        jsFilterScript: `function jsFilter() {
  return 'legacy-string';
}`,
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"message":"legacy-string"');
  });

  it('treats JSON errcode responses as callback failures even when HTTP status is 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: vi.fn(() => 'application/json'),
      },
      text: vi.fn(async () => '{"errcode":40008,"errmsg":"invalid message type"}'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await CallbackService.sendCallback(
      {
        ...baseConfig,
        jsFilterEnabled: false,
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(result).toEqual({
      success: false,
      error: 'Callback API rejected request with errcode 40008: invalid message type',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes response body details when the callback endpoint returns a non-2xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn(async () => '{"code":19024,"msg":"Key Words Not Found"}'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await CallbackService.sendCallback(
      {
        ...baseConfig,
        jsFilterEnabled: false,
      },
      {
        sessionId: 'session-1',
      }
    );

    expect(result).toEqual({
      success: false,
      error: 'HTTP 400: Bad Request - code 19024: Key Words Not Found',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
