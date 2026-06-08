/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generic React error boundary.
 *
 * React error boundaries must be class components — there is no hook equivalent
 * for `getDerivedStateFromError` / `componentDidCatch`. We keep this class
 * intentionally small and stateless apart from the caught-error state so it
 * stays cheap to drop around lazy / external chunks.
 *
 * Usage:
 *   <ErrorBoundary fallback={(err, reset) => <FailedCard onRetry={reset} />}>
 *     <ChunkThatSometimesCrashes />
 *   </ErrorBoundary>
 *
 * On catch:
 *   - logs to `console.error` so the renderer dev tools show the stack
 *   - stores the error in state so the fallback can render it
 *   - calls `onError` if provided (for IPC / Sentry-style reporting)
 *   - shows the supplied `fallback` (or a small default) instead of the tree
 *
 * The boundary does NOT swallow async rejections — only render-phase / lifecycle
 * errors that propagate during reconciliation. Use `.catch()` on promises for
 * those.
 */

import React from 'react';

export type ErrorBoundaryFallback = (error: Error, reset: () => void) => React.ReactNode;

export type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Render-prop fallback. Receives the captured error and a reset callback. */
  fallback?: ErrorBoundaryFallback;
  /** Optional reporter (Sentry, IPC channel, etc.) — receives the same error. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /** Stable label used by `onError` and the default fallback so log lines and
   *  the on-screen message both name what failed. */
  label?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to the renderer console so the dev tools show the stack. The label
    // (when provided) is included so log lines name the failed region.
    const label = this.props.label ? `[${this.props.label}] ` : '';
    // eslint-disable-next-line no-console
    console.error(`${label}ErrorBoundary caught render error:`, error, info);
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <ErrorBoundaryDefaultFallback error={error} label={this.props.label} onRetry={this.reset} />;
  }
}

const ErrorBoundaryDefaultFallback: React.FC<{ error: Error; label?: string; onRetry: () => void }> = ({
  error,
  label,
  onRetry,
}) => (
  <div
    role='alert'
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 24,
      width: '100%',
      height: '100%',
      color: 'var(--text-secondary, #6b5f48)',
      fontSize: 13,
      textAlign: 'center',
      boxSizing: 'border-box',
    }}
  >
    <strong style={{ color: 'var(--brand, #b4480c)', fontSize: 14 }}>
      {label ? `${label} unavailable` : 'This section is unavailable'}
    </strong>
    <span style={{ maxWidth: 360, wordBreak: 'break-word' }}>{error.message || String(error)}</span>
    <button
      type='button'
      onClick={onRetry}
      style={{
        padding: '4px 12px',
        borderRadius: 4,
        border: '1px solid var(--bg-3, #d4d4d4)',
        background: 'var(--bg-2, #ececec)',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      Retry
    </button>
  </div>
);

export default ErrorBoundary;
