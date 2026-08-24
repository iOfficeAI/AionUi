/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import PreviewTabs from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs';

// t returns the key verbatim so tooltips assert against the raw i18n key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const baseProps = () => ({
  tabs: [{ id: 't1', title: 'file.md' }],
  activeTabId: 't1',
  tabFadeState: { left: false, right: false },
  tabsContainerRef: React.createRef<HTMLDivElement>(),
  onSwitchTab: vi.fn(),
  onCloseTab: vi.fn(),
  onContextMenu: vi.fn(),
  onClosePanel: vi.fn(),
});

describe('PreviewTabs maximize button', () => {
  afterEach(() => cleanup());

  it('hides the maximize button when no toggle handler is provided (mobile)', () => {
    render(<PreviewTabs {...baseProps()} />);
    expect(screen.queryByTitle('preview.maximizePanel')).toBeNull();
    expect(screen.queryByTitle('preview.restorePanel')).toBeNull();
  });

  it('shows the maximize tooltip when not maximized', () => {
    render(<PreviewTabs {...baseProps()} isMaximized={false} onToggleMaximize={vi.fn()} />);
    expect(screen.getByTitle('preview.maximizePanel')).toBeTruthy();
    expect(screen.queryByTitle('preview.restorePanel')).toBeNull();
  });

  it('shows the restore tooltip when maximized', () => {
    render(<PreviewTabs {...baseProps()} isMaximized={true} onToggleMaximize={vi.fn()} />);
    expect(screen.getByTitle('preview.restorePanel')).toBeTruthy();
    expect(screen.queryByTitle('preview.maximizePanel')).toBeNull();
  });

  it('invokes the toggle handler on click', () => {
    const onToggleMaximize = vi.fn();
    render(<PreviewTabs {...baseProps()} isMaximized={false} onToggleMaximize={onToggleMaximize} />);
    fireEvent.click(screen.getByTitle('preview.maximizePanel'));
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
  });
});
