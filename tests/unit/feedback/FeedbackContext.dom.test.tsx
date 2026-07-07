/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * White-box tests for FeedbackProvider / useFeedback: verifies the provider
 * owns a single modal, screenshots are captured via the electronAPI shim,
 * and the modal receives module + screenshots props.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
  Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Capture props the provider passes to the modal so we can assert prefill wiring
// without pulling the whole Upload/Sentry stack into the DOM.
const modalSpy = vi.fn();
vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  __esModule: true,
  default: (props: {
    visible: boolean;
    onCancel: () => void;
    defaultModule?: string;
    prefilledScreenshots?: Array<{ filename: string; data: Uint8Array; type: string }>;
    feedbackTags?: Record<string, string>;
    feedbackExtra?: Record<string, unknown>;
    feedbackDiagnosticsContext?: {
      explicitContext?: Record<string, string>;
      explicitProfiles?: string[];
      routeAtOpen?: string;
    };
  }) => {
    modalSpy(props);
    if (!props.visible) return null;
    return (
      <div data-testid='modal-stub'>
        <div data-testid='modal-module'>{props.defaultModule ?? 'none'}</div>
        <div data-testid='modal-screenshots'>{props.prefilledScreenshots?.length ?? 0}</div>
        <button type='button' onClick={props.onCancel}>
          close
        </button>
      </div>
    );
  },
}));

import { FeedbackProvider, useFeedback } from '@/renderer/hooks/context/FeedbackContext';

type CaptureFn = () => Promise<{ filename: string; data: number[] } | null>;

function setElectronAPI(capture: CaptureFn | undefined) {
  (window as unknown as { electronAPI?: { captureFeedbackScreenshot?: CaptureFn } }).electronAPI =
    capture === undefined ? undefined : { captureFeedbackScreenshot: capture };
}

const Trigger: React.FC<{
  module?: string;
  autoScreenshot?: boolean;
  diagnosticsContext?: Record<string, string>;
  diagnosticsProfiles?: string[];
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}> = ({ module, autoScreenshot, diagnosticsContext, diagnosticsProfiles, tags, extra }) => {
  const { openFeedback } = useFeedback();
  return (
    <button
      type='button'
      onClick={() => {
        openFeedback({ module, autoScreenshot, diagnosticsContext, diagnosticsProfiles, tags, extra });
      }}
    >
      open
    </button>
  );
};

const renderWithProvider = (ui: React.ReactElement) => render(<FeedbackProvider>{ui}</FeedbackProvider>);

describe('FeedbackProvider / useFeedback', () => {
  beforeEach(() => {
    modalSpy.mockClear();
    setElectronAPI(undefined);
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('mounts the modal hidden by default', () => {
    renderWithProvider(<Trigger />);
    // First render: modalSpy called with visible=false
    expect(modalSpy).toHaveBeenCalled();
    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.visible).toBe(false);
  });

  it('opens the modal and forwards the module prop', async () => {
    const user = userEvent.setup();
    renderWithProvider(<Trigger module='mcp-tools' autoScreenshot={false} />);

    await user.click(document.querySelector('button')!);

    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.visible).toBe(true);
    expect(lastCall.defaultModule).toBe('mcp-tools');
    expect(lastCall.prefilledScreenshots).toBeUndefined();
  });

  it('forwards feedback tags and extra context to the modal', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <Trigger
        module='conversation-session'
        autoScreenshot={false}
        tags={{
          agent_error_code: 'USER_AGENT_ACP_INIT_FAILED',
          agent_error_ownership: 'user_agent',
        }}
        extra={{
          agent_error: {
            code: 'USER_AGENT_ACP_INIT_FAILED',
            ownership: 'user_agent',
          },
        }}
      />
    );

    await user.click(document.querySelector('button')!);

    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.visible).toBe(true);
    expect(lastCall.feedbackTags).toEqual({
      agent_error_code: 'USER_AGENT_ACP_INIT_FAILED',
      agent_error_ownership: 'user_agent',
    });
    expect(lastCall.feedbackExtra).toEqual({
      agent_error: {
        code: 'USER_AGENT_ACP_INIT_FAILED',
        ownership: 'user_agent',
      },
    });
  });

  it('captures route and explicit diagnostics context when opening feedback', async () => {
    window.location.hash = '#/conversation/conv-1';
    const user = userEvent.setup();
    renderWithProvider(
      <Trigger
        module='system-settings'
        autoScreenshot={false}
        diagnosticsContext={{ conversationId: 'conv-1' }}
        diagnosticsProfiles={['conversation-session']}
      />
    );

    await user.click(document.querySelector('button')!);

    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.visible).toBe(true);
    expect(lastCall.feedbackDiagnosticsContext).toEqual({
      explicitContext: { conversationId: 'conv-1' },
      explicitProfiles: ['conversation-session'],
      routeAtOpen: '#/conversation/conv-1',
    });
  });

  it('captures a screenshot via electronAPI when autoScreenshot=true', async () => {
    const capture = vi.fn(() =>
      Promise.resolve({
        filename: 'shot.png',
        data: [1, 2, 3, 4],
      })
    );
    setElectronAPI(capture);

    const user = userEvent.setup();
    renderWithProvider(<Trigger module='agent-detection' autoScreenshot={true} />);

    await user.click(document.querySelector('button')!);

    await waitFor(() => {
      const lastCall = modalSpy.mock.calls.at(-1)?.[0];
      expect(lastCall.visible).toBe(true);
      expect(lastCall.prefilledScreenshots).toHaveLength(1);
    });

    expect(capture).toHaveBeenCalledTimes(1);
    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.defaultModule).toBe('agent-detection');
    expect(lastCall.prefilledScreenshots[0].filename).toBe('shot.png');
    expect(lastCall.prefilledScreenshots[0].type).toBe('image/png');
    expect(Array.from(lastCall.prefilledScreenshots[0].data)).toEqual([1, 2, 3, 4]);
  });

  it('opens the modal without screenshots when the electronAPI shim is missing', async () => {
    const user = userEvent.setup();
    renderWithProvider(<Trigger module='system-settings' autoScreenshot={true} />);

    await user.click(document.querySelector('button')!);

    await waitFor(() => {
      const lastCall = modalSpy.mock.calls.at(-1)?.[0];
      expect(lastCall.visible).toBe(true);
    });
    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.prefilledScreenshots).toBeUndefined();
  });

  it('opens the modal with no screenshot when capture throws', async () => {
    const capture = vi.fn(() => Promise.reject(new Error('denied')));
    setElectronAPI(capture);

    const user = userEvent.setup();
    renderWithProvider(<Trigger module='conversation-session' autoScreenshot={true} />);

    await user.click(document.querySelector('button')!);

    await waitFor(() => {
      const lastCall = modalSpy.mock.calls.at(-1)?.[0];
      expect(lastCall.visible).toBe(true);
    });
    expect(capture).toHaveBeenCalledTimes(1);
    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.prefilledScreenshots).toBeUndefined();
  });

  it('clears screenshots and hides the modal on cancel', async () => {
    const capture = vi.fn(() =>
      Promise.resolve({
        filename: 'shot.png',
        data: [9, 9, 9],
      })
    );
    setElectronAPI(capture);

    const user = userEvent.setup();
    const { getByText } = renderWithProvider(<Trigger module='mcp-tools' autoScreenshot={true} />);

    await user.click(document.querySelector('button')!);

    await waitFor(() => {
      const lastCall = modalSpy.mock.calls.at(-1)?.[0];
      expect(lastCall.visible).toBe(true);
    });

    await user.click(getByText('close'));

    const lastCall = modalSpy.mock.calls.at(-1)?.[0];
    expect(lastCall.visible).toBe(false);
    expect(lastCall.prefilledScreenshots).toBeUndefined();
    expect(lastCall.feedbackTags).toBeUndefined();
    expect(lastCall.feedbackExtra).toBeUndefined();
  });

  it('returns a no-op openFeedback when used outside a provider', async () => {
    // Render <Trigger /> without wrapping FeedbackProvider so the hook hits
    // its fallback branch. The click must resolve without throwing.
    const user = userEvent.setup();
    render(<Trigger module='mcp-tools' autoScreenshot={true} />);

    await user.click(document.querySelector('button')!);
    // No modal rendered, no crash.
    expect(document.querySelector('[data-testid="modal-stub"]')).toBeNull();
  });
});
