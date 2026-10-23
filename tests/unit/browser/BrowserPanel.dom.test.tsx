import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrowserPanel from '@renderer/pages/conversation/components/BrowserPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock @/common/config/constants for alias resolution in test env
vi.mock('@/common/config/constants', () => ({
  BROWSER_SESSION_PARTITION: 'persist:aionui-browser',
}));

describe('BrowserPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      browserClick: vi.fn().mockResolvedValue({ success: true }),
      browserNavigate: vi.fn().mockResolvedValue({ success: true, url: 'https://example.com' }),
      browserScreenshot: vi.fn().mockResolvedValue({ success: true }),
      browserScroll: vi.fn().mockResolvedValue({ success: true }),
      browserType: vi.fn().mockResolvedValue({ success: true }),
      captureFeedbackScreenshot: vi.fn(),
      collectFeedbackLogs: vi.fn(),
      emit: vi.fn(),
      getPathForFile: vi.fn(),
      logFeedbackEvent: vi.fn(),
      on: vi.fn(),
      recoverCorruptedDatabase: vi.fn(),
    };
  });

  it('renders with display:none when visible is false (preserves webview state)', () => {
    const { container } = render(<BrowserPanel visible={false} />);
    const root = container.firstChild as HTMLElement;
    // Improvement 3: panel stays mounted but hidden via CSS to preserve session/scroll state
    expect(root).not.toBeNull();
    expect(root.style.display).toBe('none');
  });

  it('renders address bar, buttons, and webview when visible is true', () => {
    const onClose = vi.fn();
    const { container } = render(<BrowserPanel initialUrl='https://example.com' onClose={onClose} visible={true} />);

    const root = container.firstChild as HTMLElement;
    expect(root.style.display).not.toBe('none');
    expect(screen.getByRole('textbox')).toBeDefined();
    const webview = container.querySelector('webview');
    expect(webview).toBeDefined();
    // Partition now comes from BROWSER_SESSION_PARTITION constant
    expect(webview?.getAttribute('partition')).toBe('persist:aionui-browser');
    expect(webview?.getAttribute('src')).toBe('https://example.com');
  });

  it('handles address bar input and navigation', async () => {
    render(<BrowserPanel initialUrl='https://example.com' visible={true} />);
    const input = screen.getByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://test.com' } });
      fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });
    });
    expect(window.electronAPI?.browserNavigate).toHaveBeenCalledWith('https://test.com');
  });
});
