/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  mutate: vi.fn(),
  onSubmit: vi.fn(),
  protocolReset: vi.fn(),
}));

function MockSelectOption({ children, value }: { children?: React.ReactNode; value: string }) {
  return <option value={value}>{typeof children === 'string' ? children : value}</option>;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    visible,
    children,
    onOk,
    okText,
  }: {
    visible: boolean;
    children: React.ReactNode;
    onOk?: () => void;
    okText?: React.ReactNode;
  }) =>
    visible ? (
      <div role='dialog'>
        {children}
        <button type='button' onClick={onOk}>
          {okText}
        </button>
      </div>
    ) : null,
}));

vi.mock('@icon-park/react', () => ({
  LinkCloud: () => <span aria-hidden='true'>link</span>,
  Loading: () => <span aria-hidden='true'>loading</span>,
  PreviewOpen: () => <span aria-hidden='true'>vision</span>,
  Refresh: () => <span aria-hidden='true'>refresh</span>,
  Search: () => <span aria-hidden='true'>search</span>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      fetchModelList: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: () => 'provider-id',
}));

vi.mock('@renderer/hooks/agent/useModeModeList', () => ({
  default: () => ({
    data: { models: [] },
    error: null,
    isLoading: false,
    mutate: mocks.mutate,
  }),
}));

vi.mock('@renderer/hooks/system/useProtocolDetection', () => ({
  default: () => ({
    isDetecting: false,
    reset: mocks.protocolReset,
    result: null,
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();

  type Option = {
    disabled?: boolean;
    label?: React.ReactNode;
    value: string;
  };
  type SelectProps = {
    children?: React.ReactNode;
    mode?: 'multiple';
    onChange?: (value: string | string[]) => void;
    options?: Array<Option | string>;
    value?: string | string[];
  };

  const MockSelect = ({ children, mode, onChange, options = [], value }: SelectProps) => {
    const optionValues = new Set([
      ...options.map((option) => (typeof option === 'string' ? option : option.value)),
      ...React.Children.toArray(children)
        .filter(React.isValidElement)
        .map((child) => (child as React.ReactElement<{ value?: string }>).props.value)
        .filter((item): item is string => Boolean(item)),
    ]);
    const testId = optionValues.has('supported')
      ? 'vision-select'
      : optionValues.has('chat_completions')
        ? 'api-mode-select'
        : undefined;

    return (
      <select
        data-testid={testId}
        multiple={mode === 'multiple'}
        value={mode === 'multiple' ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? value : ''}
        onChange={(event) => {
          if (mode === 'multiple') {
            onChange?.(Array.from(event.currentTarget.selectedOptions, (option) => option.value));
            return;
          }
          onChange?.(event.currentTarget.value);
        }}
      >
        {options.map((option) => {
          const normalized = typeof option === 'string' ? { label: option, value: option } : option;
          return (
            <option key={normalized.value} value={normalized.value} disabled={normalized.disabled}>
              {typeof normalized.label === 'string' ? normalized.label : normalized.value}
            </option>
          );
        })}
        {children}
      </select>
    );
  };

  return {
    ...actual,
    Message: {
      useMessage: () => [
        {
          error: vi.fn(),
          info: vi.fn(),
          success: vi.fn(),
          warning: vi.fn(),
        },
        null,
      ],
    },
    Select: Object.assign(MockSelect, { Option: MockSelectOption }),
  };
});

import { supportsOpenAiApiMode, updateModelSettings } from '@/common/utils/modelCapabilities';
import AddModelModal from '@/renderer/pages/settings/components/AddModelModal';
import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';

const provider = (overrides: Partial<IProvider> = {}): IProvider => ({
  api_key: 'test-key',
  base_url: 'https://api.example.com/v1',
  id: 'provider-1',
  models: ['gpt-4o'],
  name: 'OpenAI compatible',
  platform: 'openai',
  ...overrides,
});

describe('supportsOpenAiApiMode', () => {
  it('allows OpenAI-compatible providers', () => {
    expect(supportsOpenAiApiMode('openai')).toBe(true);
    expect(supportsOpenAiApiMode('custom')).toBe(true);
  });

  it('hides the selector for non-OpenAI wire protocols', () => {
    expect(supportsOpenAiApiMode('anthropic')).toBe(false);
    expect(supportsOpenAiApiMode('new-api', 'anthropic')).toBe(false);
  });

  it('uses the selected protocol for new-api providers', () => {
    expect(supportsOpenAiApiMode('new-api', 'openai')).toBe(true);
  });
});

describe('updateModelSettings', () => {
  it('applies explicit settings to every selected model without changing other models', () => {
    const result = updateModelSettings(
      { existing: { image_input: 'unsupported' } },
      ['gpt-4o', 'gpt-5.6-sol'],
      'supported',
      'responses'
    );

    expect(result.existing).toEqual({ image_input: 'unsupported' });
    expect(result['gpt-4o']).toEqual({ image_input: 'supported', openai_api_mode: 'responses' });
    expect(result['gpt-5.6-sol']).toEqual({ image_input: 'supported', openai_api_mode: 'responses' });
  });

  it('stores unsupported when vision is explicitly disabled and the API mode is automatic', () => {
    const result = updateModelSettings(
      {
        'gpt-4o': { image_input: 'supported', openai_api_mode: 'chat_completions' },
        other: { image_input: 'supported' },
      },
      ['gpt-4o'],
      'unsupported',
      'auto'
    );

    expect(result).toEqual({
      'gpt-4o': { image_input: 'unsupported' },
      other: { image_input: 'supported' },
    });
  });

  it('keeps a newly configured model on automatic capability detection', () => {
    expect(updateModelSettings(undefined, ['gpt-4o'], 'auto', 'auto')).toEqual({});
  });

  it('stores only API mode when vision remains automatic', () => {
    expect(updateModelSettings(undefined, ['gpt-4o'], 'auto', 'responses')).toEqual({
      'gpt-4o': { openai_api_mode: 'responses' },
    });
  });

  it('removes an existing model override when both settings return to automatic', () => {
    expect(
      updateModelSettings(
        {
          'gpt-4o': { image_input: 'unsupported', openai_api_mode: 'responses' },
          other: { image_input: 'supported' },
        },
        ['gpt-4o'],
        'auto',
        'auto'
      )
    ).toEqual({ other: { image_input: 'supported' } });
  });
});

describe('model capability selectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('uses dropdowns and preserves explicit values while editing a model', async () => {
    render(
      <AddModelModal
        data={provider({
          model_settings: {
            'gpt-4o': { image_input: 'supported', openai_api_mode: 'responses' },
          },
        })}
        model='gpt-4o'
        modalProps={{ visible: true }}
        modalCtrl={{ close: mocks.close }}
        onSubmit={mocks.onSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vision-select')).toHaveValue('supported');
      expect(screen.getByTestId('api-mode-select')).toHaveValue('responses');
    });

    fireEvent.change(screen.getByTestId('vision-select'), { target: { value: 'unsupported' } });
    fireEvent.change(screen.getByTestId('api-mode-select'), { target: { value: 'chat_completions' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));

    expect(mocks.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model_settings: {
          'gpt-4o': { image_input: 'unsupported', openai_api_mode: 'chat_completions' },
        },
      })
    );
  });

  it('does not render an API mode dropdown for a non-OpenAI provider', async () => {
    render(
      <AddModelModal
        data={provider({ platform: 'anthropic' })}
        model='gpt-4o'
        modalProps={{ visible: true }}
        modalCtrl={{ close: mocks.close }}
        onSubmit={mocks.onSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vision-select')).toHaveValue('auto');
    });
    expect(screen.queryByTestId('api-mode-select')).not.toBeInTheDocument();
  });

  it('shows dropdowns for the new OpenAI-compatible provider form', async () => {
    render(
      <AddPlatformModal
        deepLinkData={{ api_key: 'test-key', base_url: 'https://api.example.com/v1', platform: 'OpenAI' }}
        modalProps={{ visible: true }}
        modalCtrl={{ close: mocks.close }}
        onSubmit={mocks.onSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vision-select')).toHaveValue('auto');
      expect(screen.getByTestId('api-mode-select')).toHaveValue('auto');
    });

    fireEvent.change(screen.getByTestId('vision-select'), { target: { value: 'supported' } });
    fireEvent.change(screen.getByTestId('api-mode-select'), { target: { value: 'responses' } });

    expect(screen.getByTestId('vision-select')).toHaveValue('supported');
    expect(screen.getByTestId('api-mode-select')).toHaveValue('responses');
  });

  it('keeps API mode hidden on the Gemini provider form', async () => {
    render(
      <AddPlatformModal
        deepLinkData={{ api_key: 'test-key', platform: 'gemini' }}
        modalProps={{ visible: true }}
        modalCtrl={{ close: mocks.close }}
        onSubmit={mocks.onSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vision-select')).toHaveValue('auto');
    });
    expect(screen.queryByTestId('api-mode-select')).not.toBeInTheDocument();
  });
});
