/**
 * ResizeObserver 错误抑制 Hook
 * 用于在组件级别处理 ResizeObserver 错误
 */
import { useEffect } from 'react';

export const useResizeObserverErrorSuppression = () => {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message?.includes('ResizeObserver')) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('ResizeObserver')) {
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    return () => {
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, []);
};
