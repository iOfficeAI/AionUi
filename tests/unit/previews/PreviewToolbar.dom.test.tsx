/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewToolbar from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar';

vi.mock('@icon-park/react', () => ({
  Close: () => <span data-testid='close-icon' />,
  FileFocus: () => <span data-testid='file-focus-icon' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'preview.closePreview': '关闭预览',
        'preview.downloadFile': '下载文件',
        'preview.openInSystemApp': '使用系统默认应用打开',
        'preview.preview': '预览',
        'preview.revealInWorkspace': '定位到文件栏',
        'preview.source': '原文',
        'common.download': '下载',
      })[key] ?? key,
  }),
}));

const baseProps = {
  content_type: 'code',
  isMarkdown: false,
  isHTML: false,
  viewMode: 'preview' as const,
  isSplitScreenEnabled: false,
  showOpenInSystemButton: false,
  showRevealInWorkspaceButton: true,
  historyTarget: null,
  snapshotSaving: false,
  onViewModeChange: vi.fn(),
  onSplitScreenToggle: vi.fn(),
  onSaveSnapshot: vi.fn(),
  onRefreshHistory: vi.fn(),
  renderHistoryDropdown: vi.fn(),
  onOpenInSystem: vi.fn(),
  onRevealInWorkspace: vi.fn(),
  onDownload: vi.fn(),
};

describe('PreviewToolbar', () => {
  it('calls reveal-in-workspace when the file panel icon is clicked', () => {
    const onRevealInWorkspace = vi.fn();

    render(<PreviewToolbar {...baseProps} onRevealInWorkspace={onRevealInWorkspace} />);

    fireEvent.click(screen.getByTitle('定位到文件栏'));

    expect(onRevealInWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('定位到文件栏')).not.toBeInTheDocument();
  });

  it('places download before open-in-system', () => {
    render(<PreviewToolbar {...baseProps} content_type='image' showOpenInSystemButton />);

    const downloadButton = screen.getByText('下载');
    const openInSystemButton = screen.getByText('使用系统默认应用打开');

    expect(downloadButton.compareDocumentPosition(openInSystemButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
