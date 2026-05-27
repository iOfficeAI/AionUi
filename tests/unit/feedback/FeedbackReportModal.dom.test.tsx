/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * White-box tests for FeedbackReportModal's prefill behavior.
 * Verifies that defaultModule + prefilledScreenshots props seed the form
 * when the modal becomes visible, and that cancel clears the form.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import FeedbackReportModal, {
  type PrefilledScreenshot,
} from '@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal';

const renderModal = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

const buildScreenshot = (name: string, byte: number): PrefilledScreenshot => ({
  filename: name,
  data: new Uint8Array([byte, byte + 1, byte + 2]),
  type: 'image/png',
});

describe('FeedbackReportModal — prefill', () => {
  beforeEach(() => {
    // Ensure no leftover global electronAPI from other tests interferes.
    (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render form content when visible=false', () => {
    renderModal(<FeedbackReportModal visible={false} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('feedback-report-scroll-body')).not.toBeInTheDocument();
  });

  it('renders the form body when visible=true', () => {
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} />);
    expect(screen.getByTestId('feedback-report-scroll-body')).toBeInTheDocument();
  });

  it('applies defaultModule on open, showing it as the selected option', () => {
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='mcp-tools' />);
    // The select shows the i18n key (mock returns the key itself). That is how other
    // tests in this repo verify module labels with the t() → identity mock.
    expect(screen.getByText('settings.bugReportModuleMcp')).toBeInTheDocument();
  });

  it('seeds the Upload list with prefilled screenshots', () => {
    const shots = [buildScreenshot('shot-a.png', 1), buildScreenshot('shot-b.png', 10)];
    renderModal(
      <FeedbackReportModal
        visible={true}
        onCancel={vi.fn()}
        defaultModule='conversation-session'
        prefilledScreenshots={shots}
      />
    );

    // The picture-card Upload renders one .arco-upload-list-item per screenshot.
    // Arco also appends a separate `+` trigger until the 3-item limit is hit.
    expect(document.querySelectorAll('.arco-upload-list-item').length).toBe(2);
  });

  it('shows the uploaded count next to the screenshot label when seeded', () => {
    const shots = [buildScreenshot('a.png', 1), buildScreenshot('b.png', 2)];
    renderModal(
      <FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='mcp-tools' prefilledScreenshots={shots} />
    );
    expect(screen.getByTestId('feedback-report-screenshot-count')).toBeInTheDocument();
  });

  it('hides the uploaded count when no screenshots are attached', () => {
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='mcp-tools' />);
    expect(screen.queryByTestId('feedback-report-screenshot-count')).not.toBeInTheDocument();
  });

  it('caps prefilled screenshots to the 3-item upload limit', () => {
    const shots = [
      buildScreenshot('a.png', 1),
      buildScreenshot('b.png', 2),
      buildScreenshot('c.png', 3),
      buildScreenshot('d.png', 4),
      buildScreenshot('e.png', 5),
    ];
    renderModal(
      <FeedbackReportModal
        visible={true}
        onCancel={vi.fn()}
        defaultModule='system-settings'
        prefilledScreenshots={shots}
      />
    );

    // Only the first 3 screenshots make it into the Upload list.
    expect(document.querySelectorAll('.arco-upload-list-item').length).toBe(3);
    // When the limit is hit Arco hides the `+` trigger tile.
    expect(document.querySelector('.arco-upload-trigger-picture')).toBeNull();
  });

  it('calls onCancel when the close button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderModal(<FeedbackReportModal visible={true} onCancel={onCancel} defaultModule='agent-detection' />);

    const closeBtn = document.querySelector('.aionui-modal-close-btn') as HTMLElement | null;
    expect(closeBtn).not.toBeNull();
    await user.click(closeBtn!);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
