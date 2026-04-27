/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import type { TProviderWithModel } from '@/common/config/storage';

const model = {} as TProviderWithModel;

describe('buildAgentConversationParams', () => {
  it('emits preset_enabled_skills + exclude_auto_inject_skills when is_preset=true', () => {
    const params = buildAgentConversationParams({
      backend: 'claude',
      name: 'test',
      workspace: '/tmp/t',
      model,
      is_preset: true,
      preset_resources: {
        rules: 'rule',
        enabled_skills: ['pdf'],
        exclude_auto_inject_skills: ['cron'],
      },
    });
    expect(params.extra).toMatchObject({
      preset_enabled_skills: ['pdf'],
      exclude_auto_inject_skills: ['cron'],
      preset_context: 'rule',
    });
    // Legacy names must not appear.
    expect((params.extra as Record<string, unknown>).enabled_skills).toBeUndefined();
    expect((params.extra as Record<string, unknown>).exclude_builtin_skills).toBeUndefined();
  });

  it('omits skill fields when is_preset=false', () => {
    const params = buildAgentConversationParams({
      backend: 'claude',
      name: 'test',
      workspace: '/tmp/t',
      model,
      is_preset: false,
    });
    expect((params.extra as Record<string, unknown>).preset_enabled_skills).toBeUndefined();
    expect((params.extra as Record<string, unknown>).exclude_auto_inject_skills).toBeUndefined();
  });

  it('omits skill fields when preset_resources is absent', () => {
    const params = buildAgentConversationParams({
      backend: 'claude',
      name: 'test',
      workspace: '/tmp/t',
      model,
      is_preset: true,
    });
    expect((params.extra as Record<string, unknown>).preset_enabled_skills).toBeUndefined();
    expect((params.extra as Record<string, unknown>).exclude_auto_inject_skills).toBeUndefined();
  });

  it('omits skill fields when preset_resources arrays are empty', () => {
    const params = buildAgentConversationParams({
      backend: 'claude',
      name: 'test',
      workspace: '/tmp/t',
      model,
      is_preset: true,
      preset_resources: {
        enabled_skills: [],
        exclude_auto_inject_skills: [],
      },
    });
    expect((params.extra as Record<string, unknown>).preset_enabled_skills).toBeUndefined();
    expect((params.extra as Record<string, unknown>).exclude_auto_inject_skills).toBeUndefined();
  });
});
