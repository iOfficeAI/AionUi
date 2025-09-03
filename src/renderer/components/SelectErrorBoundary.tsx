import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

class SelectErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // 只处理 ResizeObserver 相关的错误
    if (error.message && error.message.includes('ResizeObserver')) {
      return { hasError: false }; // 不显示错误状态
    }
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 忽略 ResizeObserver 错误
    if (error.message && error.message.includes('ResizeObserver')) {
      return;
    }
    console.error('SelectErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong with the select component.</div>;
    }

    return this.props.children;
  }
}

export default SelectErrorBoundary;
