import type { AcpConfigOptionDto, SetConfigOptionResponse } from '@/common/types/platform/acpTypes';
import {
  deriveSelectOption,
  hasObservedValue,
  mergeSnapshotPreservingKnownCurrents,
  THOUGHT_LEVEL_FALLBACK_IDS,
} from '@/renderer/hooks/agent/useAcpConfigOptions';
import { describe, expect, it } from 'vitest';

const options: AcpConfigOptionDto[] = [
  {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: 'gpt-5.5',
    options: [
      { value: 'gpt-5.5', name: 'GPT-5.5' },
      { value: 'gpt-5.4', name: 'GPT-5.4' },
    ],
  },
  {
    id: 'reasoning_effort',
    category: 'thought_level',
    option_type: 'select',
    current_value: 'high',
    options: [
      { value: 'low', name: 'Low' },
      { value: 'high', name: 'High' },
    ],
  },
];

describe('ACP config option derivation', () => {
  it('keeps model and thought_level independent', () => {
    const model = deriveSelectOption(options, 'model', ['model']);
    const thought = deriveSelectOption(options, 'thought_level', ['reasoning_effort']);

    expect(model?.currentValue).toBe('gpt-5.5');
    expect(model?.options.map((item) => item.value)).toEqual(['gpt-5.5', 'gpt-5.4']);
    expect(thought?.currentValue).toBe('high');
    expect(thought?.options.map((item) => item.value)).toEqual(['low', 'high']);
  });

  it('derives select options from backend DTOs using type', () => {
    const backendOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        type: 'select',
        current_value: 'high',
        options: [
          { value: 'low', name: 'Low' },
          { value: 'high', name: 'High' },
        ],
      },
    ] as unknown as AcpConfigOptionDto[];

    const thought = deriveSelectOption(backendOptions, 'thought_level', ['reasoning_effort']);

    expect(thought?.currentValue).toBe('high');
    expect(thought?.options.map((item) => item.value)).toEqual(['low', 'high']);
  });

  it('accepts only observed set responses with matching current_value', () => {
    const response: SetConfigOptionResponse = {
      confirmation: 'observed',
      config_options: options,
    };

    expect(hasObservedValue(response, 'model', 'gpt-5.5')).toBe(true);
    expect(hasObservedValue(response, 'model', 'gpt-5.4')).toBe(false);
  });

  it('rejects command_ack responses without mutating confirmed state', () => {
    const response: SetConfigOptionResponse = {
      confirmation: 'command_ack',
      config_options: null,
    };

    expect(hasObservedValue(response, 'model', 'gpt-5.5')).toBe(false);
  });
});

describe('thought-level option matching', () => {
  const thoughtDto = (overrides: Partial<AcpConfigOptionDto>): AcpConfigOptionDto =>
    ({
      id: 'reasoning_effort',
      option_type: 'select',
      current_value: 'high',
      options: [
        { value: 'low', name: 'Low' },
        { value: 'high', name: 'High' },
      ],
      ...overrides,
    }) as AcpConfigOptionDto;

  it.each(['thinking', 'thinking_budget', 'effort'])('matches the %s fallback id without a category', (id) => {
    const derived = deriveSelectOption(
      [thoughtDto({ id, category: undefined })],
      'thought_level',
      THOUGHT_LEVEL_FALLBACK_IDS
    );
    expect(derived?.id).toBe(id);
    expect(derived?.currentValue).toBe('high');
  });

  it('prefers the thought_level category over a fallback-id match', () => {
    const byCategory = thoughtDto({ id: 'custom', category: 'thought_level', current_value: 'low' });
    const byId = thoughtDto({ id: 'thinking', category: undefined });
    const derived = deriveSelectOption([byId, byCategory], 'thought_level', THOUGHT_LEVEL_FALLBACK_IDS);
    expect(derived?.id).toBe('custom');
    expect(derived?.currentValue).toBe('low');
  });
});

describe('mergeSnapshotPreservingKnownCurrents (anti-flicker)', () => {
  const snapshot = (modelCurrent: string | null, effortCurrent: string | null): AcpConfigOptionDto[] => [
    {
      id: 'model',
      category: 'model',
      option_type: 'select',
      current_value: modelCurrent,
      options: [{ value: 'gpt-5.5', name: 'GPT-5.5' }],
    },
    {
      id: 'reasoning_effort',
      category: 'thought_level',
      option_type: 'select',
      current_value: effortCurrent,
      options: [
        { value: 'low', name: 'Low' },
        { value: 'high', name: 'High' },
      ],
    },
  ];

  it('preserves known currents when the incoming frame carries no current at all', () => {
    const merged = mergeSnapshotPreservingKnownCurrents(snapshot('gpt-5.5', 'high'), snapshot(null, null));
    expect(merged.find((o) => o.category === 'model')?.current_value).toBe('gpt-5.5');
    expect(merged.find((o) => o.category === 'thought_level')?.current_value).toBe('high');
  });

  it('lets an informed frame clear a sibling current (the reject re-push)', () => {
    // The Core reject re-push still knows the model current but deliberately
    // nulls the refused effort — the null MUST win, not be "protected".
    const merged = mergeSnapshotPreservingKnownCurrents(snapshot('gpt-5.5', 'high'), snapshot('gpt-5.5', null));
    expect(merged.find((o) => o.category === 'thought_level')?.current_value).toBeNull();
  });

  it('does not revive a current the new option list no longer offers', () => {
    const next = snapshot(null, null);
    next[1] = { ...next[1], options: [{ value: 'medium', name: 'Medium' }] };
    const merged = mergeSnapshotPreservingKnownCurrents(snapshot(null, 'high'), next);
    expect(merged.find((o) => o.category === 'thought_level')?.current_value).toBeNull();
  });

  it('passes the frame through untouched when there is no previous snapshot', () => {
    const next = snapshot(null, null);
    expect(mergeSnapshotPreservingKnownCurrents(null, next)).toBe(next);
    expect(mergeSnapshotPreservingKnownCurrents([], next)).toBe(next);
  });
});
