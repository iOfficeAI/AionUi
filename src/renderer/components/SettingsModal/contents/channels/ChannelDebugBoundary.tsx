/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

type ChannelDebugBoundaryProps = {
  children: React.ReactNode;
};

type ChannelDebugBoundaryState = {
  hasError: boolean;
  message?: string;
};

class ChannelDebugBoundary extends React.Component<ChannelDebugBoundaryProps, ChannelDebugBoundaryState> {
  constructor(props: ChannelDebugBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChannelDebugBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unknown channel render error',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Channels] Render crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className='px-[12px] md:px-[28px] text-13px text-danger'>{this.state.message || 'Channels render failed'}</div>;
    }

    return this.props.children;
  }
}

export default ChannelDebugBoundary;
