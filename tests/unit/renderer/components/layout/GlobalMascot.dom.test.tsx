import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigStorage } from '@/common/config/storage';
import GlobalMascot from '@/renderer/components/layout/GlobalMascot';

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(undefined),
  },
}));

const setRect = (element: HTMLElement, rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.bottom - rect.top,
        right: rect.left + rect.width,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  });
};

describe('GlobalMascot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(ConfigStorage.get).mockImplementation((key: string) => {
      if (key === 'system.mascotEnabled') {
        return Promise.resolve(false);
      }
      return Promise.resolve(undefined);
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 720,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders in a portal and tracks focused inputs above the target', async () => {
    vi.mocked(ConfigStorage.get).mockImplementation((key: string) => {
      if (key === 'system.mascotEnabled') {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    });
    render(
      <>
        <GlobalMascot />
        <input data-testid='tracked-input' />
      </>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const input = screen.getByTestId('tracked-input');
    setRect(input, { top: 240, bottom: 280, left: 100, width: 320 });

    fireEvent.focusIn(input);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const mascot = screen.getByTestId('global-mascot');
    expect(mascot.closest('[data-mascot-root="true"]')).toBeInTheDocument();
    expect(mascot).toHaveAttribute('data-state', 'visible');
    expect(mascot).toHaveAttribute('data-placement', 'above');
    expect(mascot.style.transform).toContain('translate3d(112px, 200px, 0)');
    expect(mascot.style.transform).toContain('scale(1)');
  });

  it('switches below the target when there is not enough room above', async () => {
    vi.mocked(ConfigStorage.get).mockImplementation((key: string) => {
      if (key === 'system.mascotEnabled') {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    });
    render(
      <>
        <GlobalMascot />
        <textarea data-testid='tracked-textarea' />
      </>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const textarea = screen.getByTestId('tracked-textarea');
    setRect(textarea, { top: 18, bottom: 66, left: 40, width: 280 });

    fireEvent.focusIn(textarea);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const mascot = screen.getByTestId('global-mascot');
    expect(mascot).toHaveAttribute('data-placement', 'below');
    expect(mascot.style.transform).toContain('translate3d(52px, 66px, 0)');
  });

  it('supports focusable mascot-marked div targets', async () => {
    vi.mocked(ConfigStorage.get).mockImplementation((key: string) => {
      if (key === 'system.mascotEnabled') {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    });
    render(
      <>
        <GlobalMascot />
        <div data-testid='mascot-host' data-mascot='true' tabIndex={0} />
      </>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const host = screen.getByTestId('mascot-host');
    setRect(host, { top: 320, bottom: 380, left: 220, width: 180 });

    fireEvent.focusIn(host);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const mascot = screen.getByTestId('global-mascot');
    expect(mascot).toHaveAttribute('data-state', 'visible');
    expect(mascot.style.transform).toContain('translate3d(232px, 280px, 0)');
  });

  it('returns to idle after focus leaves tracked targets for 500ms', async () => {
    vi.mocked(ConfigStorage.get).mockImplementation((key: string) => {
      if (key === 'system.mascotEnabled') {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    });
    render(
      <>
        <GlobalMascot />
        <input data-testid='tracked-input' />
        <button data-testid='plain-button' type='button'>
          Other
        </button>
      </>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const input = screen.getByTestId('tracked-input');
    const button = screen.getByTestId('plain-button');
    setRect(input, { top: 180, bottom: 220, left: 88, width: 240 });

    fireEvent.focusIn(input);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const mascot = screen.getByTestId('global-mascot');
    expect(mascot).toHaveAttribute('data-state', 'visible');

    fireEvent.focusOut(input, { relatedTarget: button });
    fireEvent.focusIn(button);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });

    expect(mascot).toHaveAttribute('data-state', 'visible');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mascot).toHaveAttribute('data-state', 'idle');
    expect(mascot.style.transform).toContain('translate3d(100px, 150px, 0)');
    expect(mascot.style.transform).toContain('scale(0.72)');
  });

  it('stays hidden by default when mascot is disabled', async () => {
    render(<GlobalMascot />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('global-mascot')).not.toBeInTheDocument();
  });

  it('updates the displayed mascot when the selection event is dispatched', async () => {
    vi.mocked(ConfigStorage.get).mockImplementation((key: string) => {
      if (key === 'system.mascotEnabled') {
        return Promise.resolve(true);
      }
      return Promise.resolve(undefined);
    });
    render(<GlobalMascot />);

    await act(async () => {
      await Promise.resolve();
    });

    const mascot = screen.getByTestId('global-mascot');
    expect(mascot).toHaveAttribute('data-mascot-id', 'cute');

    await act(async () => {
      window.dispatchEvent(new CustomEvent('aionui:global-mascot-changed', { detail: { id: 'geminiC' } }));
    });

    expect(mascot).toHaveAttribute('data-mascot-id', 'geminiC');
  });
});
