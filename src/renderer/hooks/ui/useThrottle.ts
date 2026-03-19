import type React from 'react';
import { useCallback, useRef } from 'react';

/**
 * 节流 Hook
 * @param callback 需要节流的函数
 * @param delay 节流时间（毫秒）
 * @returns 节流后的函数
 */
function useThrottle<T extends (...args: any[]) => any>(callback: T, delay: number, deps: React.DependencyList): T {
  const lastExecTime = useRef<number>(0);
  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  const throttledFunction = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastExec = now - lastExecTime.current;

      // 如果距离上次执行已经超过延迟时间，立即执行
      if (timeSinceLastExec >= delay) {
        callback(...args);
        lastExecTime.current = now;
      } else {
        // 否则清除之前的定时器，设置新的定时器
        if (timeoutId.current) {
          clearTimeout(timeoutId.current);
        }

        timeoutId.current = setTimeout(() => {
          callback(...args);
          lastExecTime.current = Date.now();
          timeoutId.current = null;
        }, delay - timeSinceLastExec);
      }
    },
    [delay, ...deps]
  );

  return throttledFunction as T;
}

export default useThrottle;
