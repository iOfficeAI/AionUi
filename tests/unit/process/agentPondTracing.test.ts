/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalFilesSdkProvider = process.env.FILES_SDK_PROVIDER;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();

  if (originalFilesSdkProvider === undefined) {
    delete process.env.FILES_SDK_PROVIDER;
  } else {
    process.env.FILES_SDK_PROVIDER = originalFilesSdkProvider;
  }
});

describe('AgentPond image-generation tracing', () => {
  it('stays disabled when no Files SDK provider is configured', async () => {
    delete process.env.FILES_SDK_PROVIDER;

    const { agentPondTracingEnabled, flushAgentPondTracing } =
      await import('@/process/resources/builtinMcp/agentPondTracing');

    expect(agentPondTracingEnabled).toBe(false);
    await expect(flushAgentPondTracing()).resolves.toBeUndefined();
  });

  it('does not interrupt image generation when tracing configuration is invalid', async () => {
    process.env.FILES_SDK_PROVIDER = 'not-a-provider';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { agentPondTracingEnabled, flushAgentPondTracing } =
      await import('@/process/resources/builtinMcp/agentPondTracing');

    expect(agentPondTracingEnabled).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      '[ImageGenMCP] AgentPond tracing is disabled:',
      expect.stringContaining('supports FILES_SDK_PROVIDER=fs')
    );
    await expect(flushAgentPondTracing()).resolves.toBeUndefined();
  });
});
