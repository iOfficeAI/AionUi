/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * ErrorBoundary unit tests. Verifies the boundary catches render-phase errors,
 * surfaces them via the optional reporter, and swaps to the supplied fallback
 * without unmounting the rest of the tree.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '@/renderer/components/base/ErrorBoundary';

const Boom: React.FC<{ message: string }> = ({ message }) => {
  throw new Error(message);
};

const Quiet: React.FC = () => <span data-testid='ok'>ok</span>;

describe('ErrorBoundary', () => {
  // Silence React's "uncaught error" log noise from the boundary test.
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    errorSpy.mockClear();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary label='t'>
        <Quiet />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('ok')).toBeTruthy();
  });

  it('catches render errors and shows the default fallback', () => {
    render(
      <ErrorBoundary label='TestRegion'>
        <Boom message='render-phase failure' />
      </ErrorBoundary>
    );
    // The default fallback surfaces the error message and a Retry button.
    expect(screen.getByText(/render-phase failure/i)).toBeTruthy();
    expect(screen.getByText(/TestRegion unavailable/i)).toBeTruthy();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('invokes the onError reporter with the captured error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary label='Reported' onError={onError}>
        <Boom message='reported-failure' />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const [err] = onError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('reported-failure');
  });

  it('uses the supplied fallback render-prop', () => {
    const fallback = vi.fn((err: Error, reset: () => void) => (
      <button type='button' onClick={reset} data-testid='custom'>
        {err.message}
      </button>
    ));
    render(
      <ErrorBoundary fallback={fallback}>
        <Boom message='custom-fallback' />
      </ErrorBoundary>
    );
    // React calls the fallback once per render after the error is caught;
    // the test only cares that the fallback path is used and receives the
    // captured error and the reset callback.
    expect(fallback.mock.calls.length).toBeGreaterThan(0);
    const [errArg, resetArg] = fallback.mock.calls[0];
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toBe('custom-fallback');
    expect(typeof resetArg).toBe('function');
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(screen.getByText('custom-fallback')).toBeTruthy();
  });

  it('reset re-mounts the children so a subsequent error-free render is shown again', () => {
    let shouldThrow = true;
    const Maybe: React.FC = () => {
      if (shouldThrow) throw new Error('flaky');
      return <span data-testid='recovered'>recovered</span>;
    };
    const { rerender } = render(
      <ErrorBoundary label='reset'>
        <Maybe />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/flaky/i)).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    rerender(
      <ErrorBoundary label='reset'>
        <Maybe />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('recovered')).toBeTruthy();
  });
});
