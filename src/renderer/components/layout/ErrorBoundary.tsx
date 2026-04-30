/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type ErrorInfo, type PropsWithChildren } from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#/guid';
    window.location.reload();
  };

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#/guid';
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x26A0;</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#86909c', maxWidth: '480px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type='button'
              onClick={this.handleGoHome}
              style={{
                padding: '8px 24px',
                borderRadius: '6px',
                border: '1px solid #e5e6eb',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Go Home
            </button>
            <button
              type='button'
              onClick={this.handleReload}
              style={{
                padding: '8px 24px',
                borderRadius: '6px',
                border: 'none',
                background: '#165DFF',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
