/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceSearchBar from '@/renderer/pages/conversation/Workspace/components/WorkspaceSearchBar';

vi.mock('@icon-park/react', () => ({
  Search: () => <span data-testid='search-icon' />,
}));

type RadioProps = {
  value: string;
  children?: React.ReactNode;
  checked?: boolean;
  onSelect?: (value: string) => void;
};

vi.mock('@arco-design/web-react', () => ({
  Input: ({
    onChange,
    placeholder,
    value,
  }: {
    onChange?: (value: string) => void;
    placeholder?: string;
    value?: string;
  }) => <input aria-label={placeholder} value={value} onChange={(event) => onChange?.(event.target.value)} />,
  Radio: Object.assign(
    ({ value, children, checked, onSelect }: RadioProps) => (
      <button type='button' aria-pressed={checked} onClick={() => onSelect?.(value)}>
        {children}
      </button>
    ),
    {
      Group: ({
        children,
        onChange,
        value,
      }: {
        children?: React.ReactNode;
        onChange?: (value: string) => void;
        value?: string;
      }) => (
        <div role='group'>
          {React.Children.map(children, (child) => {
            if (!React.isValidElement<RadioProps>(child)) return child;
            return React.cloneElement(child, {
              checked: child.props.value === value,
              onSelect: onChange,
            });
          })}
        </div>
      ),
    }
  ),
}));

const labels: Record<string, string> = {
  'common.fileAttach.addFiles': '添加文件',
  'common.fileAttach.myDevice': '我的设备',
  'conversation.workspace.refresh': '刷新',
  'conversation.workspace.searchMode.all': '全部',
  'conversation.workspace.searchMode.content': '内容',
  'conversation.workspace.searchMode.name': '文件名',
  'conversation.workspace.searchPlaceholder': '搜索文件',
  'conversation.workspace.searchScope.currentFolder': '文件夹',
  'conversation.workspace.searchScope.folderHintDesktop': '右键选择在指定文件夹下搜索',
  'conversation.workspace.searchScope.folderHintMobile': '长按选择在指定文件夹下搜索',
  'conversation.workspace.searchScope.selectedFolder': '当前：{{folder}}',
  'conversation.workspace.searchScope.workspace': '整个项目',
};

const t = ((key: string, options?: { folder?: string }) => {
  const label = labels[key] ?? key;
  return options?.folder ? label.replace('{{folder}}', options.folder) : label;
}) as never;

const baseProps = {
  t,
  isMobile: false,
  showSearch: true,
  searchText: '',
  setSearchText: vi.fn(),
  onSearch: vi.fn(),
  searchInputRef: { current: null },
  searchScope: 'workspace' as const,
  setSearchScope: vi.fn(),
  searchFolderLabel: '',
  searchMode: 'all' as const,
  setSearchMode: vi.fn(),
};

describe('WorkspaceSearchBar', () => {
  it('renders visible workspace search scope and mode switches', () => {
    const setSearchScope = vi.fn();
    const setSearchMode = vi.fn();

    render(<WorkspaceSearchBar {...baseProps} setSearchScope={setSearchScope} setSearchMode={setSearchMode} />);

    expect(screen.getByText('整个项目')).toBeInTheDocument();
    expect(screen.getByText('文件夹')).toBeInTheDocument();
    expect(screen.getByText('全部')).toBeInTheDocument();
    expect(screen.getByText('文件名')).toBeInTheDocument();
    expect(screen.getByText('内容')).toBeInTheDocument();

    fireEvent.click(screen.getByText('文件夹'));
    fireEvent.click(screen.getByText('文件名'));

    expect(setSearchScope).toHaveBeenCalledWith('currentFolder');
    expect(setSearchMode).toHaveBeenCalledWith('name');
  });

  it('shows the platform-specific folder search hint when folder scope is selected', () => {
    const { rerender } = render(
      <WorkspaceSearchBar {...baseProps} searchScope='currentFolder' searchFolderLabel='docker' />
    );

    expect(screen.getByText('右键选择在指定文件夹下搜索')).toBeInTheDocument();
    expect(screen.getByText('当前：docker')).toBeInTheDocument();

    rerender(<WorkspaceSearchBar {...baseProps} isMobile searchScope='currentFolder' searchFolderLabel='docker' />);

    expect(screen.getByText('长按选择在指定文件夹下搜索')).toBeInTheDocument();
    expect(screen.getByText('当前：docker')).toBeInTheDocument();
  });
});
