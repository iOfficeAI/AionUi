import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockOnLanguageChanged = vi.hoisted(() => ({
  handler: undefined as ((payload: { language: string }) => Promise<void>) | undefined,
}));
const mockConfigStorageGet = vi.hoisted(() => vi.fn());
const mockConfigStorageSet = vi.hoisted(() => vi.fn());
const mockChangeLanguageInvoke = vi.hoisted(() => vi.fn());
const mockI18n = vi.hoisted(() => {
  const instance = {
    language: 'en-US',
    use: vi.fn(() => instance),
    init: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (lang: string) => Promise<void>) => {
      if (event === 'languageChanged') {
        instance.languageChangedHandler = handler;
      }
      return instance;
    }),
    hasResourceBundle: vi.fn(() => false),
    addResourceBundle: vi.fn(),
    changeLanguage: vi.fn(async (lang: string) => {
      instance.language = lang;
      return undefined;
    }),
    languageChangedHandler: undefined as ((lang: string) => Promise<void>) | undefined,
  };

  return instance;
});

vi.mock('i18next', () => ({
  default: mockI18n,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: mockConfigStorageGet,
    set: mockConfigStorageSet,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      languageChanged: {
        on: (handler: (payload: { language: string }) => Promise<void>) => {
          mockOnLanguageChanged.handler = handler;
        },
      },
      changeLanguage: {
        invoke: mockChangeLanguageInvoke,
      },
    },
  },
}));

describe('renderer i18n localStorage guards', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockI18n.language = 'en-US';
    mockI18n.languageChangedHandler = undefined;
    mockConfigStorageGet.mockResolvedValue('ja-JP');
    mockConfigStorageSet.mockResolvedValue(undefined);
    mockChangeLanguageInvoke.mockResolvedValue(undefined);
    mockOnLanguageChanged.handler = undefined;

    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-US' },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes without localStorage and still loads the saved language', async () => {
    await import('@/renderer/services/i18n');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockI18n.init).toHaveBeenCalledWith(
      expect.objectContaining({
        lng: 'en-US',
      })
    );
    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('ja-JP');
  });

  it('updates language from the main-process broadcast without touching localStorage', async () => {
    await import('@/renderer/services/i18n');
    await Promise.resolve();

    await mockOnLanguageChanged.handler?.({ language: 'ko-KR' });

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('ko-KR');
  });

  it('persists language through ConfigStorage even when localStorage is unavailable', async () => {
    const module = await import('@/renderer/services/i18n');
    await Promise.resolve();

    await module.changeLanguage('tr');

    expect(mockConfigStorageSet).toHaveBeenCalledWith('language', 'tr-TR');
    expect(mockChangeLanguageInvoke).toHaveBeenCalledWith({ language: 'tr-TR' });
  });
});
