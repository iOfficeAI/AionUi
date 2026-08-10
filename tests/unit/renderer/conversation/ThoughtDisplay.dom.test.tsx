import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@arco-design/web-react', () => ({
  Spin: () => <span data-testid='spinner' />,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key }),
}));

import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';

const FIXED_NOW = 1_700_000_000_000;

describe('ThoughtDisplay status text', () => {
  it('renders custom status text with a spinner while running', () => {
    render(<ThoughtDisplay running statusText='Processing… 2 queued' />);

    expect(screen.getByText('Processing… 2 queued')).toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders custom status text without a spinner while waiting', () => {
    render(<ThoughtDisplay statusText='Waiting for this assistant to start…' />);

    expect(screen.getByText('Waiting for this assistant to start…')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });
});

describe('ThoughtDisplay runtime-failed retry layout', () => {
  it('pins the retry button on the right and truncates a long status instead of hiding it', () => {
    const longStatus = 'This assistant failed to start. '.repeat(20).trim();
    const onRetryStart = vi.fn();

    render(<ThoughtDisplay statusText={longStatus} onRetryStart={onRetryStart} />);

    // The retry button renders no matter how long the status text is, and is
    // marked non-shrinking so it cannot be pushed out of a narrow column.
    const button = screen.getByRole('button', { name: 'Retry start' });
    expect(button.className).toContain('flex-shrink-0');

    // The status takes the remaining width and truncates; the full text stays
    // reachable via the title tooltip.
    const status = screen.getByText(longStatus);
    expect(status.className).toContain('truncate');
    expect(status.className).toContain('min-w-0');
    expect(status.className).toContain('flex-1');
    expect(status).toHaveAttribute('title', longStatus);
  });

  it('renders no retry button when onRetryStart is absent (no regression for plain status)', () => {
    render(<ThoughtDisplay statusText='Processing…' />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Processing…')).toBeInTheDocument();
  });
});

describe('ThoughtDisplay elapsed timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives elapsed from an external startedAtMs (state A)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    render(<ThoughtDisplay running externalElapsedSource startedAtMs={FIXED_NOW - 80_000} statusText='Processing…' />);

    expect(screen.getByText(/1m 20s/)).toBeInTheDocument();
  });

  it('does not reset elapsed after a remount with the same startedAtMs (state A)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const props = {
      running: true,
      externalElapsedSource: true,
      startedAtMs: FIXED_NOW - 80_000,
      statusText: 'Processing…',
    } as const;
    const { unmount } = render(<ThoughtDisplay {...props} />);
    expect(screen.getByText(/1m 20s/)).toBeInTheDocument();

    unmount();
    render(<ThoughtDisplay {...props} />);

    expect(screen.getByText(/1m 20s/)).toBeInTheDocument();
    expect(screen.queryByText(/\b0s/)).not.toBeInTheDocument();
  });

  it('advances the external elapsed number every second (state A)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    render(<ThoughtDisplay running externalElapsedSource startedAtMs={FIXED_NOW - 80_000} statusText='Processing…' />);
    expect(screen.getByText(/1m 20s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText(/1m 25s/)).toBeInTheDocument();
  });

  it('suppresses the elapsed number when the external timestamp is invalid (state B)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    render(<ThoughtDisplay running externalElapsedSource startedAtMs={null} statusText='Processing… 2 queued' />);

    expect(screen.getByText('Processing… 2 queued')).toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    // No elapsed number is shown while the timestamp is invalid.
    expect(screen.queryByText(/\ds\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+s/)).not.toBeInTheDocument();
  });

  it('shows the elapsed number once a valid startedAtMs arrives (state B → A)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const { rerender } = render(
      <ThoughtDisplay running externalElapsedSource startedAtMs={null} statusText='Processing…' />
    );
    expect(screen.queryByText(/\d+s/)).not.toBeInTheDocument();

    rerender(<ThoughtDisplay running externalElapsedSource startedAtMs={FIXED_NOW - 3_000} statusText='Processing…' />);

    expect(screen.getByText(/3s/)).toBeInTheDocument();
  });

  it('recomputes from a new startedAtMs when a new turn begins', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const { rerender } = render(
      <ThoughtDisplay running externalElapsedSource startedAtMs={FIXED_NOW - 80_000} statusText='Processing…' />
    );
    expect(screen.getByText(/1m 20s/)).toBeInTheDocument();

    rerender(<ThoughtDisplay running externalElapsedSource startedAtMs={FIXED_NOW - 2_000} statusText='Processing…' />);

    expect(screen.getByText(/2s/)).toBeInTheDocument();
    expect(screen.queryByText(/1m 20s/)).not.toBeInTheDocument();
  });

  it('falls back to the local timer for non-team sessions (state C)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    render(<ThoughtDisplay running statusText='Processing…' />);
    expect(screen.getByText(/0s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByText(/3s/)).toBeInTheDocument();
  });
});
