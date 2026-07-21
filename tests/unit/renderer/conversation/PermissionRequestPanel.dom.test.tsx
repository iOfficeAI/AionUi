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

describe('PermissionRequestPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects only a one-time allow by default and wraps arrow navigation', () => {
    renderPanel();

    const always = getOptionRadio('message-permission-option-always');
    const once = getOptionRadio('message-permission-option-once');
    const reject = getOptionRadio('message-permission-option-reject');
    expect(always).not.toBeChecked();
    expect(once).toBeChecked();
    expect(reject).not.toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'messages.chooseAction' })).toBeInTheDocument();

    fireEvent.keyDown(once, { key: 'ArrowDown' });
    expect(reject).toBeChecked();
    expect(reject).toHaveFocus();

    fireEvent.keyDown(reject, { key: 'ArrowDown' });
    expect(always).toBeChecked();
    expect(always).toHaveFocus();

    fireEvent.keyDown(always, { key: 'ArrowUp' });
    expect(reject).toBeChecked();
    expect(reject).toHaveFocus();

    fireEvent.click(within(screen.getByTestId('message-permission-option-always')).getByText('Always allow'));
    expect(always).toBeChecked();
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

  it('submits Enter exactly once while pending and replaces controls with a receipt', async () => {
    let resolveRequest: (() => void) | undefined;
    let confirmButton: HTMLElement;
    const onConfirm = vi.fn(() => {
      fireEvent.click(confirmButton);
      return new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
    });
    renderPanel({ onConfirm });
    const once = getOptionRadio('message-permission-option-once');
    confirmButton = screen.getByTestId('message-permission-confirm');

    fireEvent.keyDown(once, { key: 'Enter' });
    fireEvent.keyDown(once, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('message-permission-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('once');
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();

    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });
    expect(screen.getByTestId('message-permission-status')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('message-permission-confirm')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(fireEvent.keyDown(screen.getByTestId('message-permission-status'), { key: 'Enter' })).toBe(true);
  });

  it.each([
    ['repeat', { key: 'Enter', repeat: true }],
    ['IME composition', { key: 'Enter', isComposing: true }],
    ['IME key code', { key: 'Enter', keyCode: 229 }],
    ['Control', { key: 'Enter', ctrlKey: true }],
    ['Meta', { key: 'Enter', metaKey: true }],
    ['Alt', { key: 'Enter', altKey: true }],
    ['Shift', { key: 'Enter', shiftKey: true }],
    ['Escape', { key: 'Escape' }],
  ])('ignores %s key input', (_name, init) => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onConfirm });
    const once = getOptionRadio('message-permission-option-once');

    expect(fireEvent.keyDown(once, init)).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not handle a keyboard event already consumed by a nested control', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onConfirm });
    const once = getOptionRadio('message-permission-option-once');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    event.preventDefault();

    fireEvent(once, event);
    expect(onConfirm).not.toHaveBeenCalled();
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

  it('restores the selected radio after a keyboard submission fails', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    renderPanel({ onConfirm });
    const once = getOptionRadio('message-permission-option-once');
    once.focus();
    fireEvent.keyDown(once, { key: 'Enter' });
    document.body.tabIndex = -1;
    document.body.focus();

    await act(async () => {
      rejectRequest?.(new Error('offline'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('message-permission-error')).toBeInTheDocument();
    expect(once).toHaveFocus();
    document.body.removeAttribute('tabindex');
  });

  it.each(['document element', 'panel'] as const)('restores focus when it remains on the %s', async (target) => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    renderPanel({ onConfirm });
    const once = getOptionRadio('message-permission-option-once');
    once.focus();
    fireEvent.keyDown(once, { key: 'Enter' });
    const focusTarget =
      target === 'document element'
        ? document.documentElement
        : (screen.getByTestId('message-permission-card').querySelector('[aria-busy]') as HTMLElement);
    focusTarget.tabIndex = -1;
    focusTarget.focus();

    await act(async () => {
      rejectRequest?.(new Error('offline'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('message-permission-error')).toBeInTheDocument();
    expect(once).toHaveFocus();
    focusTarget.removeAttribute('tabindex');
  });

  it('does not reclaim focus when the user moved elsewhere while awaiting a failure', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    renderPanel({ onConfirm });
    const once = getOptionRadio('message-permission-option-once');
    const externalButton = document.createElement('button');
    document.body.append(externalButton);
    once.focus();
    fireEvent.keyDown(once, { key: 'Enter' });
    externalButton.focus();

    await act(async () => {
      rejectRequest?.(new Error('offline'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('message-permission-error')).toBeInTheDocument();
    expect(externalButton).toHaveFocus();
    externalButton.remove();
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

  it('ignores keys outside the options and arrows when every choice is disabled', () => {
    const disabledOption: PermissionPanelOption = {
      id: 'disabled:0',
      value: 'disabled',
      label: 'Unavailable',
      intent: 'allow-once',
      testId: 'message-permission-option-disabled',
      disabled: true,
    };
    renderPanel({ options: [disabledOption] });
    const radio = getOptionRadio('message-permission-option-disabled');

    expect(fireEvent.keyDown(screen.getByText('Permission request'), { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(radio, { key: 'ArrowDown' })).toBe(true);
    expect(screen.getByTestId('message-permission-confirm')).toBeDisabled();
  });

  it('starts arrow navigation at either end when no option is selected', () => {
    const options = [makeOptions()[0], { ...makeOptions()[2], intent: 'neutral' as const }];
    const down = renderPanel({ options });
    const always = getOptionRadio('message-permission-option-always');
    fireEvent.keyDown(always, { key: 'ArrowDown' });
    expect(always).toBeChecked();
    down.unmount();

    renderPanel({ options });
    const reject = getOptionRadio('message-permission-option-reject');
    fireEvent.keyDown(reject, { key: 'ArrowUp' });
    expect(reject).toBeChecked();
  });

  it.each([
    ['execute', 'messages.permissionKinds.execute'],
    ['edit', 'messages.permissionKinds.edit'],
    ['read', 'messages.permissionKinds.read'],
    ['fetch', 'messages.permissionKinds.fetch'],
    ['tool', 'messages.permissionKinds.tool'],
  ] as const)('renders the %s operation treatment', (operationKind, label) => {
    renderPanel({ operationKind });
    expect(screen.getByTestId('message-permission-card')).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

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
