import { fireEvent, render, screen } from '@testing-library/react';
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
  Close: () => <span data-testid='icon-close' />,
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
