/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodeBlock from '@/renderer/components/Markdown/CodeBlock';
import { TERMINAL_EXEC_EVENT } from '@/renderer/pages/conversation/Terminal/terminalEvents';
import { WORKSPACE_ENSURE_OPEN_EVENT } from '@/renderer/utils/workspace/workspaceEvents';

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key }),
}));

describe('CodeBlock terminal execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Run in Terminal button for bash code blocks', () => {
    render(<CodeBlock className='language-bash'>{'npm install\n'}</CodeBlock>);

    const runButton = screen.queryByTestId('run-in-terminal-button');
    expect(runButton).not.toBeNull();
  });

  it('renders Run in Terminal button for zsh and powershell code blocks', () => {
    const { unmount: unmountZsh } = render(<CodeBlock className='language-zsh'>{'echo hello\n'}</CodeBlock>);
    expect(screen.getByTestId('run-in-terminal-button')).toBeDefined();
    unmountZsh();

    render(<CodeBlock className='language-powershell'>{'Get-Process\n'}</CodeBlock>);
    expect(screen.getByTestId('run-in-terminal-button')).toBeDefined();
  });

  it('does NOT render Run in Terminal button for non-shell code blocks', () => {
    render(<CodeBlock className='language-python'>{'print("hello world")\n'}</CodeBlock>);

    const runButton = screen.queryByTestId('run-in-terminal-button');
    expect(runButton).toBeNull();
  });

  it('dispatches terminal exec event when Run in Terminal button is clicked', () => {
    const execListener = vi.fn();
    const openListener = vi.fn();
    window.addEventListener(TERMINAL_EXEC_EVENT, execListener);
    window.addEventListener(WORKSPACE_ENSURE_OPEN_EVENT, openListener);

    render(<CodeBlock className='language-bash'>{'git status\n'}</CodeBlock>);

    const runButton = screen.getByTestId('run-in-terminal-button');
    fireEvent.click(runButton);

    expect(execListener).toHaveBeenCalledTimes(1);
    const event = execListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.command.trim()).toBe('git status');

    expect(openListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(TERMINAL_EXEC_EVENT, execListener);
    window.removeEventListener(WORKSPACE_ENSURE_OPEN_EVENT, openListener);
  });
});
