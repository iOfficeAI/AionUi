/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * DOM tests for the visible layout mode selector. Validates the user-facing
 * affordance the layout-01 testability fix added: only available modes are
 * listed, the active mode is identified, and the keyboard shortcut that
 * replaced the macOS-colliding Cmd/Ctrl+Shift+1..5 no longer collides with
 * screenshot shortcuts.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LayoutModeProvider, useLayoutMode } from '@/renderer/hooks/context/LayoutModeContext';
import LayoutModeSelector from '@/renderer/components/layout/LayoutModeSelector';

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  isMacOS: () => true,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span data-testid='icon-down' />,
  LayoutFive: () => <span data-testid='icon-terminal-focused' />,
  LayoutOne: () => <span data-testid='icon-default' />,
  LayoutThree: () => <span data-testid='icon-editor' />,
  LayoutTwo: () => <span data-testid='icon-split' />,
}));

vi.mock('@arco-design/web-react', () => {
  const Tooltip = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Button = ({
    children,
    onClick,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: (event: React.MouseEvent) => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' onClick={onClick} {...rest}>
      {children}
    </button>
  );
  // Render the dropdown menu eagerly so the tests can assert on the menu
  // items without needing to interact with Arco's portal/trigger machinery.
  const Dropdown = ({ droplist, children }: { droplist?: React.ReactNode; children: React.ReactElement }) => {
    return (
      <div>
        {children}
        <div data-testid='dropdown-droplist'>{droplist}</div>
      </div>
    );
  };
  const MenuItem = ({
    children,
    onClick,
    'aria-checked': ariaChecked,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    'aria-checked'?: boolean;
  }) => (
    <div role='menuitemradio' aria-checked={ariaChecked} onClick={onClick} tabIndex={0}>
      {children}
    </div>
  );
  // Arco's Menu is a namespace with Menu.Item as a sub-component. Mirror
  // the same shape so the production code's `<Menu.Item>` JSX works in
  // the test environment.
  const Menu: React.FC<{ children?: React.ReactNode; selectedKeys?: string[] }> & {
    Item: typeof MenuItem;
  } = ({ children, selectedKeys }) => (
    <div role='menu' data-selected={selectedKeys?.join(',')}>
      {children}
    </div>
  );
  Menu.Item = MenuItem;
  return { Dropdown, Menu, MenuItem, Tooltip, Button };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; number?: number; name?: string }) => {
      if (options?.defaultValue) {
        let value = options.defaultValue;
        if (options.number !== undefined) value = value.replace('{{number}}', String(options.number));
        if (options.name !== undefined) value = value.replace('{{name}}', options.name);
        return value;
      }
      // Map known terminal.layout.* keys to readable English fallbacks so
      // tests can assert on the human label rather than the i18n key string.
      const map: Record<string, string> = {
        'terminal.layout.modeDefault': 'Default',
        'terminal.layout.modeSplitPane': 'Split Pane',
        'terminal.layout.modeEditorFocused': 'Editor Focused',
        'terminal.layout.modeDiffFocused': 'Diff Focused',
        'terminal.layout.modeTerminalFocused': 'Terminal Focused',
        'terminal.layout.selectorLabel': 'Layout mode',
        'terminal.layout.selectorHint': 'Choose a layout mode',
        'terminal.layout.selectorCurrent': 'Current layout: {{name}}',
      };
      return map[key] ?? key;
    },
  }),
}));

const STORAGE_KEY = 'aionui.layoutMode';

const flushEffects = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('LayoutModeSelector — visible mode selector', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  it('renders a button with the current mode label', async () => {
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <LayoutModeSelector />
      </LayoutModeProvider>
    );

    await flushEffects();
    const button = screen.getByRole('button', { name: /current layout: default/i });
    expect(button).toBeInTheDocument();
  });

  it('lists only modes that are available in the current runtime', async () => {
    // editor / diff unavailable in this app's current state — selector should
    // not surface them as choices.
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <LayoutModeSelector />
      </LayoutModeProvider>
    );

    await flushEffects();
    const items = screen.queryAllByRole('menuitemradio');
    const labels = items.map((item) => item.textContent || '');
    expect(labels.some((l) => /editor focused/i.test(l))).toBe(false);
    expect(labels.some((l) => /diff focused/i.test(l))).toBe(false);
    expect(labels.some((l) => /default/i.test(l))).toBe(true);
    expect(labels.some((l) => /split pane/i.test(l))).toBe(true);
  });

  it('marks the active mode with aria-checked=true', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'split-pane');
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <LayoutModeSelector />
      </LayoutModeProvider>
    );

    await flushEffects();
    const checked = screen
      .queryAllByRole('menuitemradio')
      .filter((item) => item.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]?.textContent || '').toMatch(/split pane/i);
  });
});

describe('LayoutModeProvider — keyboard shortcut fixes', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  const Harness: React.FC = () => {
    const { mode } = useLayoutMode();
    return <div data-testid='active-mode'>{mode}</div>;
  };

  it('does NOT react to Cmd+Shift+1 (the old, macOS-screenshot-colliding shortcut)', async () => {
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <Harness />
      </LayoutModeProvider>
    );

    await flushEffects();
    fireEvent.keyDown(window, { key: '1', metaKey: true, shiftKey: true });
    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('default');
  });

  it('does NOT react to Ctrl+Shift+1', async () => {
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <Harness />
      </LayoutModeProvider>
    );

    await flushEffects();
    fireEvent.keyDown(window, { key: '1', ctrlKey: true, shiftKey: true });
    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('default');
  });

  it('reacts to the new Cmd+Alt+Shift+2 shortcut and switches to split-pane', async () => {
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <Harness />
      </LayoutModeProvider>
    );

    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('default');
    fireEvent.keyDown(window, { key: '2', metaKey: true, altKey: true, shiftKey: true });
    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('split-pane');
  });

  it('cycles modes with Cmd+Alt+Shift+] and Cmd+Alt+Shift+[', async () => {
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <Harness />
      </LayoutModeProvider>
    );

    await flushEffects();
    fireEvent.keyDown(window, { key: ']', metaKey: true, altKey: true, shiftKey: true });
    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('split-pane');

    fireEvent.keyDown(window, { key: '[', metaKey: true, altKey: true, shiftKey: true });
    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('default');
  });

  it('ignores Cmd+Alt+Shift+1 when the target mode is not available', async () => {
    // editor-focused is unavailable in the provider (editorAvailable=false),
    // so the shortcut should not produce a state change.
    render(
      <LayoutModeProvider isMobile={false} editorAvailable={false} diffAvailable={false}>
        <Harness />
      </LayoutModeProvider>
    );

    await flushEffects();
    fireEvent.keyDown(window, { key: '3', metaKey: true, altKey: true, shiftKey: true });
    await flushEffects();
    expect(screen.getByTestId('active-mode').textContent).toBe('default');
  });
});
