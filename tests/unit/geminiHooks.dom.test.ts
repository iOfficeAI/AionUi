/**
 * Unit tests for useGeminiQuotaFallback hook
 * Covers quota error handling, model switching, and deduplication logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';

// --- Mocks ---

const mockIsApiErrorMessage = vi.fn<(data: unknown) => boolean>().mockReturnValue(false);
const mockIsQuotaErrorMessage = vi.fn<(data: unknown) => boolean>().mockReturnValue(false);
const mockResolveFallbackTarget = vi.fn<() => { provider: IProvider; model: string } | null>().mockReturnValue(null);
const mockMessageWarning = vi.fn();
const mockMessageSuccess = vi.fn();

vi.mock('@/renderer/utils/model/errorDetection', () => ({
  isApiErrorMessage: (...args: unknown[]) => mockIsApiErrorMessage(...(args as [unknown])),
  isQuotaErrorMessage: (...args: unknown[]) => mockIsQuotaErrorMessage(...(args as [unknown])),
}));

vi.mock('@/renderer/utils/model/modelFallback', () => ({
  resolveFallbackTarget: (...args: unknown[]) => mockResolveFallbackTarget(...(args as [])),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    warning: (...args: unknown[]) => mockMessageWarning(...args),
    success: (...args: unknown[]) => mockMessageSuccess(...args),
    error: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  })),
}));

import { useGeminiQuotaFallback } from '@/renderer/pages/conversation/platforms/gemini/useGeminiQuotaFallback';

// --- Helpers ---

const makeProvider = (id: string): IProvider =>
  ({
    id,
    name: `Provider ${id}`,
    platform: 'gemini',
  }) as unknown as IProvider;

const defaultParams = () => ({
  currentModel: { id: 'p1', useModel: 'gemini-1.5-flash' } as { id: string; useModel: string },
  providers: [makeProvider('p1')],
  geminiModeLookup: new Map(),
  getAvailableModels: vi.fn(() => ['gemini-1.5-flash', 'gemini-1.5-pro']),
  handleSelectModel: vi.fn<(provider: IProvider, modelName: string) => Promise<void>>().mockResolvedValue(undefined),
});

const makeErrorMessage = (data: string, msgId = 'msg-1'): IResponseMessage => ({
  type: 'error',
  data,
  msg_id: msgId,
  conversation_id: 'conv-1',
});

// --- Tests ---

describe('useGeminiQuotaFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiErrorMessage.mockReturnValue(false);
    mockIsQuotaErrorMessage.mockReturnValue(false);
    mockResolveFallbackTarget.mockReturnValue(null);
  });

  it('returns handleGeminiError function', () => {
    const params = defaultParams();
    const { result } = renderHook(() => useGeminiQuotaFallback(params));

    expect(result.current.handleGeminiError).toBeDefined();
    expect(typeof result.current.handleGeminiError).toBe('function');
  });

  it('handleGeminiError with quota error triggers model switch', async () => {
    const params = defaultParams();
    const fallbackProvider = makeProvider('p1');
    const fallbackModel = 'gemini-1.5-pro';

    mockIsQuotaErrorMessage.mockReturnValue(true);
    mockResolveFallbackTarget.mockReturnValue({ provider: fallbackProvider, model: fallbackModel });

    const { result } = renderHook(() => useGeminiQuotaFallback(params));

    act(() => {
      result.current.handleGeminiError(makeErrorMessage('quota exceeded limit'));
    });

    expect(params.handleSelectModel).toHaveBeenCalledWith(fallbackProvider, fallbackModel);

    // Wait for the handleSelectModel promise to resolve and Message.success to fire
    await vi.waitFor(() => {
      expect(mockMessageSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('handleGeminiError with non-quota error does not trigger model switch', () => {
    const params = defaultParams();
    mockIsQuotaErrorMessage.mockReturnValue(false);
    mockIsApiErrorMessage.mockReturnValue(false);

    const { result } = renderHook(() => useGeminiQuotaFallback(params));

    act(() => {
      result.current.handleGeminiError(makeErrorMessage('some random error'));
    });

    expect(params.handleSelectModel).not.toHaveBeenCalled();
    expect(mockMessageWarning).not.toHaveBeenCalled();
    expect(mockMessageSuccess).not.toHaveBeenCalled();
  });

  it('handleGeminiError with API key error does not trigger fallback', () => {
    const params = defaultParams();
    // API errors short-circuit before quota check
    mockIsApiErrorMessage.mockReturnValue(true);
    mockIsQuotaErrorMessage.mockReturnValue(false);

    const { result } = renderHook(() => useGeminiQuotaFallback(params));

    act(() => {
      result.current.handleGeminiError(makeErrorMessage('API key not valid'));
    });

    expect(params.handleSelectModel).not.toHaveBeenCalled();
    expect(mockResolveFallbackTarget).not.toHaveBeenCalled();
    expect(mockMessageWarning).not.toHaveBeenCalled();
  });

  it('multiple quota errors for same model only prompt once', () => {
    const params = defaultParams();
    mockIsQuotaErrorMessage.mockReturnValue(true);
    mockResolveFallbackTarget.mockReturnValue(null);

    const { result } = renderHook(() => useGeminiQuotaFallback(params));

    const message = makeErrorMessage('quota exceeded limit', 'msg-dup');

    // First call — should reach resolveFallbackTarget and show warning (no fallback available)
    act(() => {
      result.current.handleGeminiError(message);
    });

    expect(mockResolveFallbackTarget).toHaveBeenCalledTimes(1);
    expect(mockMessageWarning).toHaveBeenCalledTimes(1);

    // Second call with same msg_id — should be deduplicated
    act(() => {
      result.current.handleGeminiError(message);
    });

    expect(mockResolveFallbackTarget).toHaveBeenCalledTimes(1);
    expect(mockMessageWarning).toHaveBeenCalledTimes(1);
  });
});
