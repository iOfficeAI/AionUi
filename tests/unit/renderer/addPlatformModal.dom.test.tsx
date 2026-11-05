/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * DOM tests for the localized provider-brand annotation rendered inside each
 * platform dropdown option (renderPlatformOption): a Chinese UI locale shows
 * e.g. "Dashscope（阿里云百炼）", while a locale without a translation keeps the
 * plain base name.
 *
 * The alphabetical ordering logic lives in `sortPlatformsByDisplayName`
 * (covered by platformDisplayName.test.ts).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderPlatformOption } from '@/renderer/pages/settings/components/AddPlatformModal';
import { getPlatformByValue } from '@/renderer/utils/model/modelPlatforms';

// Mock the module's full dependency chain so importing AddPlatformModal succeeds.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }) }));
vi.mock('@/common', () => ({ ipcBridge: {} }));
vi.mock('@/common/utils', () => ({ uuid: () => 'test-uuid' }));
vi.mock('@/common/utils/urlValidation', () => ({ isGoogleApisHost: () => false }));
vi.mock('@/renderer/hooks/agent/useModeModeList', () => ({ default: () => ({}) }));
vi.mock('@/renderer/hooks/system/useProtocolDetection', () => ({ default: () => ({}) }));
vi.mock('@/renderer/utils/ui/ModalHOC', () => ({ default: (C: unknown) => C }));
vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@arco-design/web-react', () => ({
  Form: { useForm: () => [{}], useWatch: () => '', Item: () => null },
  Select: () => null,
  Input: () => null,
  Message: { useMessage: () => [{}, <span key='mc' />] },
  Switch: () => null,
}));
vi.mock('@icon-park/react', () => ({
  LinkCloud: () => <span data-testid='icon-link' />,
  Loading: () => null,
  PreviewOpen: () => null,
  Refresh: () => null,
  Search: () => null,
}));

const dashscope = getPlatformByValue('Dashscope')!;

describe('renderPlatformOption localization', () => {
  it('renders base name when no annotationKey is present', () => {
    const openai = getPlatformByValue('OpenAI')!;
    render(renderPlatformOption(openai, (k: string) => k));
    expect(screen.getByText('OpenAI')).toBeDefined();
  });

  it('appends a localized annotation in a zh locale', () => {
    const t = (key: string) => (key === 'settings.platformAnnotationDashscope' ? '阿里云百炼' : key);
    render(renderPlatformOption(dashscope, t));
    expect(screen.getByText('Dashscope（阿里云百炼）')).toBeDefined();
  });

  it('keeps the plain base name when the locale has no annotation translation', () => {
    // en-US style: t returns the key itself -> no annotation.
    render(renderPlatformOption(dashscope, (key: string) => key));
    expect(screen.getByText('Dashscope')).toBeDefined();
    expect(screen.queryByText('Dashscope（阿里云百炼）')).toBeNull();
  });

  it('falls back to the raw name when no t function is provided', () => {
    render(renderPlatformOption(dashscope, undefined));
    expect(screen.getByText('Dashscope')).toBeDefined();
  });
});
