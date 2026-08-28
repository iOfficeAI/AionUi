/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import { defaultAutoModelSettings } from '@/renderer/utils/autoModel/constants';
import { resolveAutoModel } from '@/renderer/utils/autoModel/resolveAutoModel';
import { preferenceWeight, scoreModelForSlots } from '@/renderer/utils/autoModel/tierHeuristics';

const provider = (id: string, models: string[]): IProvider =>
  ({
    id,
    name: id,
    platform: 'openai',
    base_url: 'https://example.com',
    api_key: 'k',
    models,
    enabled: true,
  }) as IProvider;

describe('scoreModelForSlots', () => {
  it('scores opus higher for planner than haiku', () => {
    const opus = scoreModelForSlots('claude-opus-4');
    const haiku = scoreModelForSlots('claude-haiku-4');
    expect(opus.planner).toBeGreaterThan(haiku.planner);
    expect(haiku.utility).toBeGreaterThan(opus.utility);
  });

  it('does not double-boost gemini pro preview for planner', () => {
    const preview = scoreModelForSlots('gemini-3-pro-preview');
    const sonnet = scoreModelForSlots('claude-sonnet-4');
    expect(preview.planner).toBeLessThanOrEqual(6);
    expect(preview.planner).toBeGreaterThan(sonnet.planner);
  });

  it('prefers sonnet over qwen3-coder-plus for worker seat', () => {
    const sonnet = scoreModelForSlots('claude-sonnet-4');
    const coder = scoreModelForSlots('qwen3-coder-plus');
    expect(sonnet.worker).toBeGreaterThan(coder.worker);
  });

  it('applies preference weights for cost vs quality', () => {
    const haiku = scoreModelForSlots('claude-haiku-4');
    const opus = scoreModelForSlots('claude-opus-4');
    const costHaiku = preferenceWeight('cost', 'worker', haiku);
    const costOpus = preferenceWeight('cost', 'worker', opus);
    const qualityHaiku = preferenceWeight('quality', 'planner', haiku);
    const qualityOpus = preferenceWeight('quality', 'planner', opus);
    expect(costHaiku).toBeGreaterThan(costOpus);
    expect(qualityOpus).toBeGreaterThan(qualityHaiku);
  });
});

describe('resolveAutoModel', () => {
  const providers = [provider('p1', ['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4'])];
  const getAvailableModels = (p: IProvider) => p.models;

  it('picks a concrete model for the worker slot automatically', () => {
    const result = resolveAutoModel({
      phase: 'worker',
      settings: defaultAutoModelSettings(),
      providers,
      getAvailableModels,
    });
    expect(result.model.use_model).toBeTruthy();
    expect(result.slot).toBe('worker');
    expect(result.reason.startsWith('automatic')).toBe(true);
  });

  it('honors a fixed planner binding', () => {
    const settings = defaultAutoModelSettings();
    settings.slots.planner = { mode: 'fixed', provider_id: 'p1', model: 'claude-opus-4' };
    const result = resolveAutoModel({
      phase: 'planner',
      settings,
      providers,
      getAvailableModels,
    });
    expect(result.model.id).toBe('p1');
    expect(result.model.use_model).toBe('claude-opus-4');
    expect(result.reason).toBe('fixed:planner');
  });

  it('falls back when the preferred seat has no candidates', () => {
    const settings = defaultAutoModelSettings();
    settings.slots.utility = { mode: 'fixed', provider_id: 'missing', model: 'nope' };
    const result = resolveAutoModel({
      phase: 'utility',
      settings,
      providers,
      getAvailableModels,
    });
    expect(result.model.use_model).toBeTruthy();
  });

  it('throws when no models are available', () => {
    expect(() =>
      resolveAutoModel({
        phase: 'worker',
        settings: defaultAutoModelSettings(),
        providers: [],
        getAvailableModels: () => [],
      })
    ).toThrow(/No agent-capable models/);
  });
});
