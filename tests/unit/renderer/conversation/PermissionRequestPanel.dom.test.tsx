/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyAcpPermission,
  classifyLegacyPermission,
  getPermissionOptionsIdentity,
  getSafePermissionOptionId,
  normalizePermissionOperationKind,
  PermissionRequestPanel,
  type PermissionPanelOption,
} from '@/renderer/pages/conversation/Messages/components/MessagePermission';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const makeOptions = (): PermissionPanelOption[] => [
  {
    id: 'always:0',
    value: 'always',
    label: 'Always allow',
    intent: 'allow-always',
    testId: 'message-permission-option-always',
  },
  {
    id: 'once:1',
    value: 'once',
    label: 'Allow once',
    intent: 'allow-once',
    testId: 'message-permission-option-once',
  },
  {
    id: 'reject:2',
    value: 'reject',
    label: 'Reject',
    intent: 'reject-once',
    testId: 'message-permission-option-reject',
  },
];

const renderPanel = (props: Partial<React.ComponentProps<typeof PermissionRequestPanel>> = {}) =>
  render(
    <PermissionRequestPanel
      requestKey='request-1'
      testIdPrefix='message-permission'
      title='Permission request'
      description='Inspect this operation before continuing'
      operationKind='execute'
      detail='bun install'
      options={makeOptions()}
      onConfirm={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  );

const getOptionButton = (testId: string): HTMLButtonElement => screen.getByTestId(testId) as HTMLButtonElement;

const getOptionsGroup = (): HTMLElement => screen.getByTestId('message-permission-options');

describe('PermissionRequestPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['allow-once', 'once', 'Allow once'],
    ['allow-always', 'always', 'Always allow'],
    ['reject-once', 'reject', 'Reject once'],
    ['reject-always', 'reject-always', 'Reject always'],
    ['neutral', 'ask', 'Ask another way'],
  ] as const)('submits every option (%s) on a single click', async (intent, value, label) => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const testId = `message-permission-option-${value}`;
    renderPanel({
      onConfirm,
      options: [{ id: `${value}:0`, value, label, intent, testId }],
    });

    fireEvent.click(getOptionButton(testId));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(value);
    expect(await screen.findByTestId('message-permission-status')).toBeInTheDocument();
  });

  it('renders each option as a focusable button with no separate confirm step', () => {
    renderPanel();

    const once = getOptionButton('message-permission-option-once');
    expect(once.tagName).toBe('BUTTON');
    once.focus();
    expect(once).toHaveFocus();
    expect(screen.queryByTestId('message-permission-confirm')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('does not move focus from the conversation on mount', () => {
    document.body.tabIndex = -1;
    document.body.focus();

    renderPanel();

    expect(document.body).toHaveFocus();
    expect(getOptionButton('message-permission-option-once')).not.toHaveFocus();
    document.body.removeAttribute('tabindex');
  });

  it.each(['button', 'textarea', 'contenteditable editor'] as const)(
    'does not take focus from an active %s',
    (surface) => {
      const editingSurface = document.createElement(
        surface === 'textarea' ? 'textarea' : surface === 'button' ? 'button' : 'div'
      );
      if (surface === 'contenteditable editor') {
        editingSurface.setAttribute('contenteditable', 'true');
        editingSurface.className = 'cm-editor';
        editingSurface.tabIndex = 0;
      }
      document.body.append(editingSurface);
      editingSurface.focus();

      renderPanel();

      expect(editingSurface).toHaveFocus();
      editingSurface.remove();
    }
  );

  it('renders only the provider label for each option', () => {
    const longLabel = 'Allow this specific workspace operation once after reviewing every affected configuration file';
    renderPanel({ options: [{ ...makeOptions()[1], label: longLabel }] });

    const option = getOptionButton('message-permission-option-once');
    expect(within(option).getByText(longLabel)).toBeInTheDocument();
    expect(option).not.toHaveTextContent('messages.permissionOptions');
  });

  it('renders the options under an accessible group with a hidden legend', () => {
    renderPanel();
    const group = getOptionsGroup();
    expect(group).toHaveAttribute('role', 'group');
    expect(within(group).getAllByRole('button')).toHaveLength(3);
  });

  it('submits exactly once while pending and replaces controls with a receipt', async () => {
    let resolveRequest: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        })
    );
    renderPanel({ onConfirm });
    const once = getOptionButton('message-permission-option-once');

    fireEvent.click(once);
    fireEvent.click(once);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('once');
    for (const button of within(getOptionsGroup()).getAllByRole('button')) expect(button).toBeDisabled();

    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });
    expect(screen.getByTestId('message-permission-status')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('message-permission-options')).not.toBeInTheDocument();
  });

  it('disables the other options while one is submitting', async () => {
    let resolveRequest: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        })
    );
    renderPanel({ onConfirm });

    fireEvent.click(getOptionButton('message-permission-option-once'));
    expect(getOptionButton('message-permission-option-always')).toBeDisabled();
    expect(getOptionButton('message-permission-option-reject')).toBeDisabled();

    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });
  });

  it('does not submit a disabled option', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      onConfirm,
      options: [
        {
          id: 'once:0',
          value: 'once',
          label: 'Allow once',
          intent: 'allow-once',
          testId: 'message-permission-option-once',
          disabled: true,
        },
      ],
    });

    expect(getOptionButton('message-permission-option-once')).toBeDisabled();
    fireEvent.click(getOptionButton('message-permission-option-once'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the options after a bridge failure and allows a retry on the same option', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    renderPanel({ onConfirm });

    fireEvent.click(getOptionButton('message-permission-option-reject'));
    expect(await screen.findByTestId('message-permission-error')).toHaveTextContent(
      'messages.permissionResponseFailed'
    );
    expect(getOptionButton('message-permission-option-reject')).toBeEnabled();

    fireEvent.click(getOptionButton('message-permission-option-reject'));
    expect(await screen.findByTestId('message-permission-status')).toBeInTheDocument();
    expect(onConfirm).toHaveBeenNthCalledWith(1, 'reject');
    expect(onConfirm).toHaveBeenNthCalledWith(2, 'reject');
  });

  it('shows an empty state and no buttons when there are no options', () => {
    renderPanel({ options: [] });
    expect(screen.getByText('messages.noOptionsAvailable')).toBeInTheDocument();
    expect(screen.queryByTestId('message-permission-options')).not.toBeInTheDocument();
  });

  it('clears a prior error when a new request arrives', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('offline'));
    const { rerender } = renderPanel({ onConfirm });
    fireEvent.click(getOptionButton('message-permission-option-always'));
    expect(await screen.findByTestId('message-permission-error')).toBeInTheDocument();

    rerender(
      <PermissionRequestPanel
        requestKey='request-2'
        testIdPrefix='message-permission'
        title='Next request'
        operationKind='edit'
        options={makeOptions()}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.queryByTestId('message-permission-error')).not.toBeInTheDocument();
    expect(getOptionButton('message-permission-option-once')).toBeEnabled();
  });

  it.each(['execute', 'edit', 'read', 'fetch', 'tool'] as const)(
    'renders the raw %s operation kind without a header icon',
    (operationKind) => {
      renderPanel({ operationKind });
      const card = screen.getByTestId('message-permission-card');
      expect(within(card).getByText(operationKind)).toBeInTheDocument();
      expect(card.querySelector('svg')).toBeNull();
    }
  );

  it('ignores a stale submission result after the request identity changes', async () => {
    let resolveRequest: (() => void) | undefined;
    const firstConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const { rerender } = renderPanel({ onConfirm: firstConfirm });
    fireEvent.click(getOptionButton('message-permission-option-once'));

    rerender(
      <PermissionRequestPanel
        requestKey='request-2'
        testIdPrefix='message-permission'
        title='Next request'
        operationKind='execute'
        options={makeOptions()}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });

    expect(screen.queryByTestId('message-permission-status')).not.toBeInTheDocument();
    expect(getOptionButton('message-permission-option-once')).toBeEnabled();
  });

  it('ignores a stale submission error after the request identity changes', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const firstConfirm = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    const { rerender } = renderPanel({ onConfirm: firstConfirm });
    fireEvent.click(getOptionButton('message-permission-option-once'));

    rerender(
      <PermissionRequestPanel
        requestKey='request-2'
        testIdPrefix='message-permission'
        title='Next request'
        operationKind='execute'
        options={makeOptions()}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await act(async () => {
      rejectRequest?.(new Error('stale failure'));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('message-permission-error')).not.toBeInTheDocument();
    expect(getOptionButton('message-permission-option-once')).toBeEnabled();
  });
});

describe('permission option normalization', () => {
  it.each([
    ['proceed_once', 'allow-once'],
    ['allow_once', 'allow-once'],
    ['proceed_always', 'allow-always'],
    ['proceed_always_server', 'allow-always'],
    ['proceed_always_tool', 'allow-always'],
    ['allow_always', 'allow-always'],
    ['cancel', 'reject-once'],
    ['deny', 'reject-once'],
    ['reject_once', 'reject-once'],
    ['reject_always', 'reject-always'],
    ['custom', 'neutral'],
  ] as const)('classifies legacy value %s', (value, intent) => {
    expect(classifyLegacyPermission(value)).toBe(intent);
  });

  it.each([
    ['allow_once', 'allow-once'],
    ['allow_always', 'allow-always'],
    ['reject_once', 'reject-once'],
    ['reject_always', 'reject-always'],
    ['custom', 'neutral'],
  ] as const)('classifies ACP kind %s', (kind, intent) => {
    expect(classifyAcpPermission(kind)).toBe(intent);
  });

  it.each([
    ['exec', 'execute'],
    ['execute', 'execute'],
    ['edit', 'edit'],
    ['info', 'read'],
    ['read', 'read'],
    ['fetch', 'fetch'],
    ['custom', 'tool'],
    [undefined, 'tool'],
  ] as const)('normalizes operation kind %s', (kind, normalized) => {
    expect(normalizePermissionOperationKind(kind)).toBe(normalized);
  });

  it('uses enabled one-time choices for safe defaults and stable identity', () => {
    const options = makeOptions();
    expect(getSafePermissionOptionId(options)).toBe('once:1');
    expect(getSafePermissionOptionId([{ ...options[1], disabled: true }])).toBeNull();
    expect(getPermissionOptionsIdentity(options)).toContain('once:1');
  });
});
