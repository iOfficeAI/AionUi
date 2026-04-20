import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockShowOpen = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockIsElectronDesktop = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: (...args: unknown[]) => mockShowOpen(...args),
      },
    },
  },
}));

vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: mockIsElectronDesktop,
}));

vi.mock('@arco-design/web-react', () => ({
  Input: ({ placeholder, value }: { placeholder?: string; value?: string }) => (
    <input placeholder={placeholder} value={value ?? ''} readOnly />
  ),
}));

vi.mock('@icon-park/react', () => ({
  Check: () => <span data-testid='icon-check' />,
  Close: ({ onClick }: { onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid='icon-close' onClick={onClick} />
  ),
  Down: () => <span data-testid='icon-down' />,
  Folder: () => <span data-testid='icon-folder' />,
  FolderOpen: () => <span data-testid='icon-folder-open' />,
  FolderPlus: () => <span data-testid='icon-folder-plus' />,
}));

import WorkspaceFolderSelect from '@/renderer/components/workspace/WorkspaceFolderSelect';

const setTriggerRect = (element: HTMLElement, rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.bottom - rect.top,
        right: rect.left + rect.width,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  });
};

describe('WorkspaceFolderSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectronDesktop.mockReturnValue(true);
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 720,
    });
  });

  it('opens upward and becomes scrollable when space below is limited', () => {
    localStorage.setItem(
      'aionui:recent-workspaces',
      JSON.stringify(['/tmp/a', '/tmp/b', '/tmp/c', '/tmp/d', '/tmp/e'])
    );

    render(
      <WorkspaceFolderSelect
        value=''
        onChange={vi.fn()}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Choose a different folder'
        triggerTestId='workspace-trigger'
        menuTestId='workspace-menu'
      />
    );

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 320,
    });

    const trigger = screen.getByTestId('workspace-trigger');
    setTriggerRect(trigger.parentElement as HTMLElement, { top: 260, bottom: 304, left: 24, width: 280 });

    fireEvent.click(trigger);

    const menu = screen.getByTestId('workspace-menu');
    expect(menu.style.bottom).toBe('64px');
    expect(menu.style.top).toBe('');
    expect(menu.style.maxHeight).toBe('252px');
    expect(menu.className).toContain('overflow-y-auto');
  });

  it('opens downward when there is enough space below the trigger', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/a']));

    render(
      <WorkspaceFolderSelect
        value=''
        onChange={vi.fn()}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Choose a different folder'
        triggerTestId='workspace-trigger'
        menuTestId='workspace-menu'
      />
    );

    const trigger = screen.getByTestId('workspace-trigger');
    setTriggerRect(trigger.parentElement as HTMLElement, { top: 48, bottom: 92, left: 24, width: 280 });

    fireEvent.click(trigger);

    const menu = screen.getByTestId('workspace-menu');
    expect(menu.style.top).toBe('96px');
    expect(menu.style.bottom).toBe('');
    expect(menu.style.maxHeight).toBe('320px');
  });
});

describe('WorkspaceFolderSelect - non-desktop fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockShowOpen.mockResolvedValue([]);
  });

  it('renders a plain Input in non-desktop environments', () => {
    mockIsElectronDesktop.mockReturnValue(false);
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect
        value='/some/path'
        onChange={onChange}
        placeholder='Select folder'
        inputPlaceholder='Enter workspace path'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
      />
    );
    const input = screen.getByPlaceholderText('Enter workspace path');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('/some/path');
  });

  it('falls back to placeholder when inputPlaceholder is absent', () => {
    mockIsElectronDesktop.mockReturnValue(false);
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={vi.fn()}
        placeholder='Fallback placeholder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
      />
    );
    expect(screen.getByPlaceholderText('Fallback placeholder')).toBeInTheDocument();
  });
});

describe('WorkspaceFolderSelect - browse interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectronDesktop.mockReturnValue(true);
    mockShowOpen.mockResolvedValue([]);
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 720 });
  });

  it('opens the file picker directly when there are no recent workspaces', async () => {
    mockShowOpen.mockResolvedValue(['/chosen/path']);
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={onChange}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/chosen/path'));
    expect(mockShowOpen).toHaveBeenCalledWith({ properties: ['openDirectory', 'createDirectory'] });
  });

  it('does not call onChange when the file picker is dismissed', async () => {
    mockShowOpen.mockResolvedValue([]);
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={onChange}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    await waitFor(() => expect(mockShowOpen).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('saves the chosen path to recent workspaces after browse', async () => {
    mockShowOpen.mockResolvedValue(['/chosen/path']);
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={vi.fn()}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    await waitFor(() => expect(mockShowOpen).toHaveBeenCalled());
    const stored = JSON.parse(localStorage.getItem('aionui:recent-workspaces') ?? '[]');
    expect(stored).toContain('/chosen/path');
  });

  it('opens browse picker via the "choose different" button inside the menu', async () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/old']));
    mockShowOpen.mockResolvedValue(['/new/path']);
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={onChange}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Choose a different folder'
        triggerTestId='ws-trigger'
        menuTestId='ws-menu'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    expect(screen.getByTestId('ws-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Choose a different folder'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/new/path'));
  });

  it('selects a recent workspace and closes the menu', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/project-a', '/tmp/project-b']));
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={onChange}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
        menuTestId='ws-menu'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    expect(screen.getByTestId('ws-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('project-a'));
    expect(onChange).toHaveBeenCalledWith('/tmp/project-a');
    expect(screen.queryByTestId('ws-menu')).not.toBeInTheDocument();
  });

  it('highlights the selected recent workspace and shows a check icon', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/selected', '/tmp/other']));
    render(
      <WorkspaceFolderSelect
        value='/tmp/selected'
        onChange={vi.fn()}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
        menuTestId='ws-menu'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    expect(screen.getByTestId('icon-check')).toBeInTheDocument();
  });

  it('handles corrupted localStorage data gracefully', () => {
    localStorage.setItem('aionui:recent-workspaces', 'not-valid-json{');
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={vi.fn()}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
      />
    );
    // Corrupt data treated as empty recents — trigger is still rendered
    expect(screen.getByTestId('ws-trigger')).toBeInTheDocument();
  });
});

describe('WorkspaceFolderSelect - clear button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectronDesktop.mockReturnValue(true);
  });

  it('calls onClear when the prop is provided', () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(
      <WorkspaceFolderSelect
        value='/current/path'
        onChange={onChange}
        onClear={onClear}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
      />
    );
    fireEvent.click(screen.getByTestId('icon-close'));
    expect(onClear).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange with empty string when no onClear is provided', () => {
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect
        value='/current/path'
        onChange={onChange}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
      />
    );
    fireEvent.click(screen.getByTestId('icon-close'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('WorkspaceFolderSelect - outside click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectronDesktop.mockReturnValue(true);
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 720 });
  });

  it('closes the dropdown when clicking outside', () => {
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/tmp/ws']));
    render(
      <WorkspaceFolderSelect
        value=''
        onChange={vi.fn()}
        placeholder='Select folder'
        recentLabel='Recent'
        chooseDifferentLabel='Browse'
        triggerTestId='ws-trigger'
        menuTestId='ws-menu'
      />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    expect(screen.getByTestId('ws-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('ws-menu')).not.toBeInTheDocument();
  });
});
