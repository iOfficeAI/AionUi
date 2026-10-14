/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression #3514: Edit Mode must expose is_full_url toggle and persist it.
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';

const onChange = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fallback?: string) => fallback || k, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('@renderer/hooks/agent/useModeModeList', () => ({
  default: () => ({
    data: { models: [] },
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      fetchModelList: { invoke: vi.fn(() => Promise.resolve({ models: [] })) },
    },
  },
}));

vi.mock('@/renderer/utils/model/modelPlatforms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/utils/model/modelPlatforms')>();
  return {
    ...actual,
    getProviderLogo: () => null,
  };
});

// Pass-through modal that surfaces footer actions without ThemeProvider.
vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    children,
    visible,
    onOk,
    okText,
    cancelText,
    onCancel,
    header,
  }: {
    children: React.ReactNode;
    visible?: boolean;
    onOk?: () => void | Promise<void>;
    okText?: string;
    cancelText?: string;
    onCancel?: () => void;
    header?: { title?: string };
  }) =>
    visible === false ? null : (
      <div>
        {header?.title ? <h1>{header.title}</h1> : null}
        {children}
        <button type='button' onClick={() => void onOk?.()}>
          {okText || 'save'}
        </button>
        <button type='button' onClick={() => onCancel?.()}>
          {cancelText || 'cancel'}
        </button>
      </div>
    ),
}));

vi.mock('@/renderer/utils/ui/ModalHOC', () => ({
  default: (Component: React.FC<any>) => {
    const Wrapped = (props: any) => (
      <Component {...props} modalProps={{ visible: true }} modalCtrl={{ close: vi.fn(), open: vi.fn() }} />
    );
    Wrapped.useModal = () => [{ open: vi.fn(), close: vi.fn() }, null];
    return Wrapped;
  },
}));

import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';

const zhipuProvider = {
  id: 'prov-1',
  name: 'Zhipu',
  platform: 'Zhipu',
  base_url: 'https://open.bigmodel.cn/api/paas/v4',
  api_key: 'test-key',
  models: ['glm-4'],
  is_full_url: false,
};

describe('EditModeModal full URL toggle (#3514)', () => {
  beforeEach(() => {
    cleanup();
    onChange.mockReset();
    // jsdom has no matchMedia; Arco Grid needs it
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders Full URL switch for preset providers like Zhipu', () => {
    render(
      <ConfigProvider>
        <EditModeModal data={zhipuProvider as any} onChange={onChange} />
      </ConfigProvider>
    );

    expect(screen.getByText('完整 URL')).toBeTruthy();
  });

  it('persists is_full_url: true on save after toggling', async () => {
    render(
      <ConfigProvider>
        <EditModeModal data={zhipuProvider as any} onChange={onChange} />
      </ConfigProvider>
    );

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    fireEvent.click(switches[0]);

    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const payload = onChange.mock.calls[0][0];
    expect(payload.is_full_url).toBe(true);
    expect(payload.base_url).toBe('https://open.bigmodel.cn/api/paas/v4');
  });
});
