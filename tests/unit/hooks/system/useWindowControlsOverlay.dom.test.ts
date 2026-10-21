import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWindowControlsOverlay } from '@/renderer/hooks/system/useWindowControlsOverlay';

describe('useWindowControlsOverlay', () => {
  const originalNavigator = window.navigator;

  afterEach(() => {
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('returns default state when navigator.windowControlsOverlay is not supported', () => {
    Object.defineProperty(window, 'navigator', {
      value: { ...originalNavigator },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useWindowControlsOverlay());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isVisible).toBe(false);
    expect(result.current.titlebarAreaRect).toBeNull();
  });

  it('initializes with overlay visible and rect when supported', () => {
    const mockRect: DOMRect = {
      x: 0,
      y: 0,
      width: 1000,
      height: 38,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 38,
      toJSON: () => {},
    };

    const listeners: Array<EventListenerOrEventListenerObject> = [];
    const mockOverlay = {
      visible: true,
      getTitlebarAreaRect: vi.fn(() => mockRect),
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      }),
    };

    Object.defineProperty(window, 'navigator', {
      value: {
        ...originalNavigator,
        windowControlsOverlay: mockOverlay,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useWindowControlsOverlay());
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isVisible).toBe(true);
    expect(result.current.titlebarAreaRect).toEqual(mockRect);
  });

  it('updates state when geometrychange event fires', () => {
    const initialRect: DOMRect = {
      x: 0,
      y: 0,
      width: 1000,
      height: 38,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 38,
      toJSON: () => {},
    };

    const newRect: DOMRect = {
      x: 0,
      y: 0,
      width: 800,
      height: 38,
      top: 0,
      left: 0,
      right: 800,
      bottom: 38,
      toJSON: () => {},
    };

    let geometryListener: ((e: Event) => void) | null = null;
    const mockOverlay = {
      visible: true,
      getTitlebarAreaRect: vi.fn(() => initialRect),
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'geometrychange' && typeof listener === 'function') {
          geometryListener = listener as (e: Event) => void;
        }
      }),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, 'navigator', {
      value: {
        ...originalNavigator,
        windowControlsOverlay: mockOverlay,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useWindowControlsOverlay());
    expect(result.current.isVisible).toBe(true);
    expect(result.current.titlebarAreaRect).toEqual(initialRect);

    // Trigger toggle/geometry change (e.g. user toggles titlebar in Edge)
    act(() => {
      if (geometryListener) {
        geometryListener({
          visible: false,
          titlebarAreaRect: newRect,
        } as unknown as Event);
      }
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.titlebarAreaRect).toEqual(newRect);
  });
});
