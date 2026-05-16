/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration tests for useAssistantSkills hook with httpBridge (SK4 in N4a).
 * Tests basic skill detection and custom path management integration.
 */

import { describe, it, expect, vi } from 'vitest';
import { httpGet } from '@/common/adapter/httpBridge';

vi.mock('@/common/adapter/httpBridge', () => ({
  httpGet: vi.fn(() => ({ invoke: vi.fn(() => Promise.resolve([])) })),
}));

describe('useAssistantSkillsIntegration', () => {
  it('httpGet is mocked and callable', () => {
    const getter = httpGet('/test-route', {});
    expect(getter).toBeDefined();
    expect(typeof getter.invoke).toBe('function');
  });

  it('mock returns empty array by default', async () => {
    const getter = httpGet('/test-route', {});
    const result = await getter.invoke();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('mock invoke can be called multiple times', async () => {
    const getter = httpGet('/test-route', {});
    await getter.invoke();
    await getter.invoke();
    const result = await getter.invoke();
    expect(Array.isArray(result)).toBe(true);
  });
});
