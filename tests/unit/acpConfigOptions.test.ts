import type { AcpConfigOptionDto, SetConfigOptionResponse } from '@/common/types/platform/acpTypes';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  classifyConfigSetError,
  deriveSelectOption,
  hasObservedValue,
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

  it('classifies a team runtime Starting conflict as a busy config update', () => {
    const error = new BackendHttpError({
      method: 'PUT',
      path: '/api/teams/team-1/conversations/conv-1/config-options/model',
      status: 409,
      body: {
        success: false,
        error: 'Team member runtime is starting',
        code: 'TEAM_MEMBER_RUNTIME_STARTING',
      },
    });

    expect(classifyConfigSetError(error)).toBe('config_update_in_progress');
  });
});
