/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isMacOS: () => true,
}));

import PreviewToolbar from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar';

const baseProps = {
  content_type: 'markdown',
  isMarkdown: true,
  isHTML: false,
  viewMode: 'source' as const,
  isSplitScreenEnabled: false,
  showOpenInSystemButton: false,
  historyTarget: null,
  snapshotSaving: false,
  onViewModeChange: vi.fn(),
  onSplitScreenToggle: vi.fn(),
  onSaveSnapshot: vi.fn(),
  onRefreshHistory: vi.fn(),
  renderHistoryDropdown: () => null,
  onOpenInSystem: vi.fn(),
  onDownload: vi.fn(),
  onClose: vi.fn(),
};

afterEach(() => vi.clearAllMocks());

describe('PreviewToolbar save button', () => {
  it('shows Save when the tab is dirty and onSave is provided', () => {
    const { container } = render(<PreviewToolbar {...baseProps} isDirty onSave={vi.fn()} />);
    expect(container.textContent).toContain('common.save');
  });

  it('hides Save when the tab is not dirty', () => {
    const { container } = render(<PreviewToolbar {...baseProps} isDirty={false} onSave={vi.fn()} />);
    expect(container.textContent).not.toContain('common.save');
  });

  it('hides Save when dirty but onSave is missing', () => {
    const { container } = render(<PreviewToolbar {...baseProps} isDirty />);
    expect(container.textContent).not.toContain('common.save');
  });

  it('calls onSave when the Save button is clicked', () => {
    const onSave = vi.fn();
    const { getByText } = render(<PreviewToolbar {...baseProps} isDirty onSave={onSave} />);
    fireEvent.click(getByText('common.save'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('exposes a macOS-style shortcut in the Save tooltip', () => {
    const { getByTitle } = render(<PreviewToolbar {...baseProps} isDirty onSave={vi.fn()} />);
    expect(getByTitle('common.save (⌘S)')).toBeTruthy();
  });
});
