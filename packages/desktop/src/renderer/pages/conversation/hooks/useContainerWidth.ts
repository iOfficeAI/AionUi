import { useEffect, useRef, useState } from 'react';

type UseContainerWidthReturn = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerWidth: number;
};

/**
 * Tracks the width of a container element using ResizeObserver,
 * falling back to window.innerWidth when the element is not yet mounted.
 */
export function useContainerWidth(): UseContainerWidthReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      setContainerWidth(typeof window === 'undefined' ? 0 : window.innerWidth);
      return;
    }
    setContainerWidth(element.offsetWidth);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      if (!entries.length) return;
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { containerRef, containerWidth };
}
