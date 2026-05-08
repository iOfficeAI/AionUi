import { AuthType } from '@office-ai/aioncli-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RotatingApiClient } from '../../../src/common/api/RotatingApiClient';

type TestClient = { apiKey: string };

class TestRotatingApiClient extends RotatingApiClient<TestClient> {
  readonly delays: number[] = [];

  constructor(apiKeys: string) {
    super(apiKeys, AuthType.USE_OPENAI, (apiKey) => ({ apiKey }), { maxRetries: 3, retryDelay: 100 });
  }

  protected override delay(ms: number): Promise<void> {
    this.delays.push(ms);
    return Promise.resolve();
  }
}

const createError = (
  status: number,
  headers?: Record<string, string | number>
): Error & { status: number; headers?: Record<string, string | number> } => {
  const error = new Error(`HTTP ${status}`) as Error & { status: number; headers?: Record<string, string | number> };
  error.status = status;
  error.headers = headers;
  return error;
};

describe('RotatingApiClient', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it('honors Retry-After on 429 without rotating API keys during provider cooldown', async () => {
    const client = new TestRotatingApiClient('key-a,key-b');
    const operation = vi
      .fn<[TestClient], Promise<string>>()
      .mockRejectedValueOnce(createError(429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce('ok');

    await expect(client.executeWithRetry(operation)).resolves.toBe('ok');

    expect(operation).toHaveBeenCalledTimes(2);
    expect(operation.mock.calls[0]?.[0].apiKey).toBe('key-a');
    expect(operation.mock.calls[1]?.[0].apiKey).toBe('key-a');
    expect(client.delays).toEqual([2000]);
    expect(client.getKeyStatus()?.current).toBe(1);
  });

  it('uses exponential backoff for 429 without Retry-After', async () => {
    const client = new TestRotatingApiClient('key-a');
    const operation = vi
      .fn<[TestClient], Promise<string>>()
      .mockRejectedValueOnce(createError(429))
      .mockRejectedValueOnce(createError(429))
      .mockResolvedValueOnce('ok');

    await expect(client.executeWithRetry(operation)).resolves.toBe('ok');

    expect(client.delays).toEqual([100, 200]);
  });

  it('still rotates keys for retryable non-rate-limit errors', async () => {
    const client = new TestRotatingApiClient('key-a,key-b');
    const operation = vi
      .fn<[TestClient], Promise<string>>()
      .mockRejectedValueOnce(createError(503))
      .mockResolvedValueOnce('ok');

    await expect(client.executeWithRetry(operation)).resolves.toBe('ok');

    expect(operation).toHaveBeenCalledTimes(2);
    expect(operation.mock.calls[0]?.[0].apiKey).toBe('key-a');
    expect(operation.mock.calls[1]?.[0].apiKey).toBe('key-b');
    expect(client.delays).toEqual([100]);
    expect(client.getKeyStatus()?.current).toBe(2);
  });
});
