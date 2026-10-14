import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BrowserCommandResult, useBrowser } from '@renderer/pages/conversation/hooks/useBrowser';

describe('useBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      browserClick: vi.fn().mockResolvedValue({ success: true }),
      browserNavigate: vi.fn().mockResolvedValue({ success: true, url: 'https://example.com' }),
      browserScreenshot: vi.fn().mockResolvedValue({ data: 'data:image/png;base64,123', success: true }),
      browserScroll: vi.fn().mockResolvedValue({ scrollX: 0, scrollY: 100, success: true }),
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

  it('initializes with default or custom initialUrl', () => {
    const { result } = renderHook(() => useBrowser({ initialUrl: 'https://test.com' }));
    expect(result.current.url).toBe('https://test.com');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it('navigates to url and calls onNavigate', async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useBrowser({ onNavigate }));

    let navRes: BrowserCommandResult | undefined;
    await act(async () => {
      navRes = await result.current.navigate('https://example.com');
    });

    expect(window.electronAPI?.browserNavigate).toHaveBeenCalledWith('https://example.com');
    expect(navRes?.success).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith('https://example.com');
  });

  it('executes click command via electronAPI', async () => {
    const { result } = renderHook(() => useBrowser());
    let clickRes: BrowserCommandResult | undefined;
    await act(async () => {
      clickRes = await result.current.click('#button');
    });
    expect(window.electronAPI?.browserClick).toHaveBeenCalledWith('#button');
    expect(clickRes?.success).toBe(true);
  });

  it('executes type command via electronAPI', async () => {
    const { result } = renderHook(() => useBrowser());
    let typeRes: BrowserCommandResult | undefined;
    await act(async () => {
      typeRes = await result.current.type('input', 'hello');
    });
    expect(window.electronAPI?.browserType).toHaveBeenCalledWith('input', 'hello');
    expect(typeRes?.success).toBe(true);
  });

  it('executes scroll command via electronAPI', async () => {
    const { result } = renderHook(() => useBrowser());
    let scrollRes: BrowserCommandResult | undefined;
    await act(async () => {
      scrollRes = await result.current.scroll(0, 100);
    });
    expect(window.electronAPI?.browserScroll).toHaveBeenCalledWith(0, 100);
    expect(scrollRes?.success).toBe(true);
  });

  it('executes screenshot command via electronAPI', async () => {
    const { result } = renderHook(() => useBrowser());
    let snapRes: BrowserCommandResult<string> | undefined;
    await act(async () => {
      snapRes = await result.current.screenshot();
    });
    expect(window.electronAPI?.browserScreenshot).toHaveBeenCalled();
    expect(snapRes?.success).toBe(true);
    expect(snapRes?.data).toBe('data:image/png;base64,123');
  });
});
