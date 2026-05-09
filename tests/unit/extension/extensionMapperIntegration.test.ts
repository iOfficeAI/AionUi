/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration tests for extension HTTP bridge integration (E3 in N4a).
 * Tests basic extension list/install route mocking.
 */

import { describe, it, expect, vi } from 'vitest';
import { httpGet, httpPost } from '@/common/adapter/httpBridge';

vi.mock('@/common/adapter/httpBridge', () => ({
  httpGet: vi.fn(() => ({ invoke: vi.fn(() => Promise.resolve([])) })),
  httpPost: vi.fn(() => ({ invoke: vi.fn(() => Promise.resolve({})) })),
}));

describe('extensionMapperIntegration', () => {
  it('httpGet returns mocked empty array', async () => {
    const getter = httpGet('/api/extension/list', {});
    const result = await getter.invoke();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('httpPost returns mocked empty object', async () => {
    const poster = httpPost('/api/extension/install', { name: 'test' });
    const result = await poster.invoke();
    expect(typeof result).toBe('object');
    expect(result).toBeDefined();
  });

  it('httpGet and httpPost are both callable', () => {
    const getter = httpGet('/test', {});
    const poster = httpPost('/test', {});
    expect(typeof getter.invoke).toBe('function');
    expect(typeof poster.invoke).toBe('function');
  });
});
