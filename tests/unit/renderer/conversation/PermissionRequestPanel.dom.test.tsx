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

const getOptionRadio = (testId: string): HTMLInputElement =>
  within(screen.getByTestId(testId)).getByRole('radio') as HTMLInputElement;

const getOptionsGroup = (): HTMLElement => screen.getByTestId('message-permission-options');

describe('PermissionRequestPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects the safe choice without moving focus from the conversation', () => {
    document.body.tabIndex = -1;
    document.body.focus();

    renderPanel();

    const optionsGroup = getOptionsGroup();
    const radios = within(optionsGroup).getAllByRole('radio') as HTMLInputElement[];
    expect(getOptionRadio('message-permission-option-once')).toBeChecked();
    expect(document.body).toHaveFocus();
    expect(getOptionRadio('message-permission-option-once')).not.toHaveFocus();
    expect(optionsGroup).not.toHaveAttribute('tabindex');
    expect(optionsGroup).not.toHaveAttribute('aria-keyshortcuts');
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios[0].name).not.toBe('');
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

  it('selects only a one-time allow by default and supports mouse selection', () => {
    renderPanel();

    const always = getOptionRadio('message-permission-option-always');
    const once = getOptionRadio('message-permission-option-once');
    const reject = getOptionRadio('message-permission-option-reject');
    expect(always).not.toBeChecked();
    expect(once).toBeChecked();
    expect(reject).not.toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'messages.chooseAction' })).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('message-permission-option-always')).getByText('Always allow'));
    expect(always).toBeChecked();
    expect(once).not.toBeChecked();
    expect(reject).not.toBeChecked();
  });

  it('renders options as one neutral list without per-intent decoration', () => {
    renderPanel();

    const optionsGroup = getOptionsGroup();
    expect(optionsGroup.children).toHaveLength(3);
    for (const option of Array.from(optionsGroup.children)) {
      expect(option).not.toHaveAttribute('data-intent');
      expect(option.querySelector('svg')).toBeNull();
    }
  });

  it('renders only the provider label for each option', () => {
    const longLabel = 'Allow this specific workspace operation once after reviewing every affected configuration file';
    renderPanel({ options: [{ ...makeOptions()[1], label: longLabel }] });

    const option = screen.getByTestId('message-permission-option-once');
    expect(within(option).getByText(longLabel)).toBeInTheDocument();
    expect(option).not.toHaveTextContent('messages.permissionOptions');
  });

  it('leaves keyboard events available to the conversation', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onConfirm });
    const conversationKeyDown = vi.fn();
    document.addEventListener('keydown', conversationKeyDown);

    try {
      const once = getOptionRadio('message-permission-option-once');
      expect(fireEvent.keyDown(once, { key: 'ArrowDown' })).toBe(true);
      expect(fireEvent.keyDown(once, { key: 'Enter' })).toBe(true);
      expect(conversationKeyDown).toHaveBeenCalledTimes(2);
      expect(onConfirm).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', conversationKeyDown);
    }
  });

  it('leaves persistent, unknown, and empty choices unselected', () => {
    const { rerender } = renderPanel({
      options: [
        {
          id: 'always:0',
          value: 'always',
          label: 'Always allow',
          intent: 'allow-always',
          testId: 'message-permission-option-always',
        },
        {
          id: 'unknown:1',
          value: 'unknown',
          label: 'Ask another way',
          intent: 'neutral',
          testId: 'message-permission-option-unknown',
        },
        {
          id: 'reject-always:2',
          value: 'reject-always',
          label: 'Always reject',
          intent: 'reject-always',
          testId: 'message-permission-option-reject-always',
        },
      ],
    });

    expect(getOptionRadio('message-permission-option-always')).not.toBeChecked();
    expect(getOptionRadio('message-permission-option-unknown')).not.toBeChecked();
    expect(getOptionRadio('message-permission-option-reject-always')).not.toBeChecked();
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();

    rerender(
      <PermissionRequestPanel
        requestKey='request-1'
        testIdPrefix='message-permission'
        title='Permission request'
        operationKind='tool'
        options={[]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText('messages.noOptionsAvailable')).toBeInTheDocument();
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();
  });

  it('submits exactly once while pending and replaces controls with a receipt', async () => {
    let resolveRequest: (() => void) | undefined;
    let confirmButton: HTMLElement;
    const onConfirm = vi.fn(() => {
      fireEvent.click(confirmButton);
      return new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
    });
    renderPanel({ onConfirm });
    confirmButton = screen.getByTestId('message-permission-confirm');

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('once');
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();
    expect(getOptionsGroup()).not.toHaveAttribute('tabindex');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();

    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });
    expect(screen.getByTestId('message-permission-status')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('message-permission-confirm')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('keeps the choice after a bridge failure and allows an explicit retry', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    renderPanel({ onConfirm });
    fireEvent.click(within(screen.getByTestId('message-permission-option-reject')).getByText('Reject'));
    fireEvent.click(screen.getByTestId('message-permission-confirm'));

    expect(await screen.findByTestId('message-permission-error')).toHaveTextContent(
      'messages.permissionResponseFailed'
    );
    expect(getOptionRadio('message-permission-option-reject')).toBeChecked();
    expect(screen.getByTestId('message-permission-confirm')).toBeEnabled();

    fireEvent.click(screen.getByTestId('message-permission-confirm'));
    expect(await screen.findByTestId('message-permission-status')).toBeInTheDocument();
    expect(onConfirm).toHaveBeenNthCalledWith(1, 'reject');
    expect(onConfirm).toHaveBeenNthCalledWith(2, 'reject');
  });

  it('revalidates removed options and clears prior state for a new request', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('offline'));
    const { rerender } = renderPanel({ onConfirm });
    fireEvent.click(within(screen.getByTestId('message-permission-option-always')).getByText('Always allow'));
    fireEvent.click(screen.getByTestId('message-permission-confirm'));
    expect(await screen.findByTestId('message-permission-error')).toBeInTheDocument();

    const nextOptions: PermissionPanelOption[] = [
      {
        id: 'next-once:0',
        value: 'next-once',
        label: 'Allow next once',
        intent: 'allow-once',
        testId: 'message-permission-option-next-once',
      },
    ];
    rerender(
      <PermissionRequestPanel
        requestKey='request-2'
        testIdPrefix='message-permission'
        title='Next request'
        operationKind='edit'
        options={nextOptions}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.queryByTestId('message-permission-error')).not.toBeInTheDocument();
    expect(getOptionRadio('message-permission-option-next-once')).toBeChecked();
  });

  it('clears a safe default when the same option becomes persistent', () => {
    const option: PermissionPanelOption = {
      id: 'shared:0',
      value: 'shared',
      label: 'Allow once',
      intent: 'allow-once',
      testId: 'message-permission-option-shared',
    };
    const { rerender } = renderPanel({ options: [option] });
    expect(getOptionRadio('message-permission-option-shared')).toBeChecked();

    rerender(
      <PermissionRequestPanel
        requestKey='request-1'
        testIdPrefix='message-permission'
        title='Permission request'
        operationKind='execute'
        options={[{ ...option, label: 'Always allow', intent: 'allow-always' }]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(getOptionRadio('message-permission-option-shared')).not.toBeChecked();
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps an option update locked and ignores the stale %s result',
    async (outcome) => {
      let resolveRequest: (() => void) | undefined;
      let rejectRequest: ((error: Error) => void) | undefined;
      const onConfirm = vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            resolveRequest = resolve;
            rejectRequest = reject;
          })
      );
      const { rerender } = renderPanel({ onConfirm });
      fireEvent.click(screen.getByTestId('message-permission-confirm'));

      const nextOptions: PermissionPanelOption[] = [
        {
          id: 'next-once:0',
          value: 'next-once',
          label: 'Allow updated request once',
          intent: 'allow-once',
          testId: 'message-permission-option-next-once',
        },
      ];
      rerender(
        <PermissionRequestPanel
          requestKey='request-1'
          testIdPrefix='message-permission'
          title='Updated permission request'
          operationKind='execute'
          options={nextOptions}
          onConfirm={onConfirm}
        />
      );
      expect(getOptionRadio('message-permission-option-next-once')).toBeChecked();
      expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();
      fireEvent.click(screen.getByTestId('message-permission-confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);

      await act(async () => {
        if (outcome === 'resolve') resolveRequest?.();
        else rejectRequest?.(new Error('stale failure'));
        await Promise.resolve();
      });
      expect(screen.queryByTestId('message-permission-status')).not.toBeInTheDocument();
      expect(screen.queryByTestId('message-permission-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('message-permission-confirm')).toBeEnabled();
    }
  );

  it('keeps confirmation disabled when every choice is disabled', () => {
    const disabledOption: PermissionPanelOption = {
      id: 'disabled:0',
      value: 'disabled',
      label: 'Unavailable',
      intent: 'allow-once',
      testId: 'message-permission-option-disabled',
      disabled: true,
    };
    renderPanel({ options: [disabledOption] });

    expect(getOptionRadio('message-permission-option-disabled')).toBeDisabled();
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();
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
    fireEvent.click(screen.getByTestId('message-permission-confirm'));

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
    expect(screen.getByTestId('message-permission-confirm')).toBeEnabled();
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
    fireEvent.click(screen.getByTestId('message-permission-confirm'));

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
    expect(screen.getByTestId('message-permission-confirm')).toBeEnabled();
  });

  it('refuses a selection that disappeared from a mutated option list', () => {
    const options = makeOptions();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPanel({ options, onConfirm });
    options.splice(1, 1);

    fireEvent.click(screen.getByTestId('message-permission-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
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
