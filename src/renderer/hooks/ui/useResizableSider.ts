import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';

type UseResizableSiderOptions = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  collapsedWidth: number;
  snapThreshold: number;
  snapHysteresis: number;
  disabled?: boolean;
};

type UseResizableSiderResult = {
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  width: number;
  isDragging: boolean;
  beginResizeDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  beginMouseResizeDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

type DragState = {
  pointerId: number | null;
  startX: number;
  startWidth: number;
  handle: HTMLDivElement;
  previousCursor: string;
  previousUserSelect: string;
};

type StartDragOptions = {
  clientX: number;
  pointerId: number | null;
  handle: HTMLDivElement;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function useResizableSider(options: UseResizableSiderOptions): UseResizableSiderResult {
  const [collapsed, setCollapsed] = useState(false);
  const [desktopWidth, setDesktopWidth] = useState(options.defaultWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const collapsedRef = useRef(collapsed);
  const desktopWidthRef = useRef(desktopWidth);
  const dragStateRef = useRef<DragState | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  useEffect(() => {
    desktopWidthRef.current = desktopWidth;
  }, [desktopWidth]);

  const flushPendingWidth = useCallback(() => {
    rafIdRef.current = null;
    const width = pendingWidthRef.current;
    if (width === null) return;
    setDragWidth(width);
  }, []);

  const scheduleWidthUpdate = useCallback(
    (width: number) => {
      pendingWidthRef.current = width;
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(flushPendingWidth);
    },
    [flushPendingWidth]
  );

  const finishDrag = useCallback(() => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    dragStateRef.current = null;
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const finalWidth = pendingWidthRef.current ?? dragState.startWidth;
    pendingWidthRef.current = null;
    setDragWidth(null);
    setIsDragging(false);

    document.body.style.cursor = dragState.previousCursor;
    document.body.style.userSelect = dragState.previousUserSelect;
    dragState.handle.closest('.layout-sider')?.classList.remove('layout-sider--dragging');
    try {
      if (dragState.pointerId !== null && dragState.handle.hasPointerCapture(dragState.pointerId)) {
        dragState.handle.releasePointerCapture(dragState.pointerId);
      }
    } catch {
      // Ignore browsers that throw when capture was already released.
    }

    const shouldCollapse = collapsedRef.current
      ? finalWidth < options.snapThreshold + options.snapHysteresis
      : finalWidth <= options.snapThreshold - options.snapHysteresis;
    if (shouldCollapse) {
      collapsedRef.current = true;
      setCollapsed(true);
      return;
    }

    const nextWidth = clamp(finalWidth, options.minWidth, options.maxWidth);
    desktopWidthRef.current = nextWidth;
    setDesktopWidth(nextWidth);
    collapsedRef.current = false;
    setCollapsed(false);
  }, [options.maxWidth, options.minWidth, options.snapHysteresis, options.snapThreshold]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId === null || event.pointerId !== dragState.pointerId) return;
      const nextWidth = clamp(
        dragState.startWidth + event.clientX - dragState.startX,
        options.collapsedWidth,
        options.maxWidth
      );
      scheduleWidthUpdate(nextWidth);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId === null || event.pointerId !== dragState.pointerId) return;
      finishDrag();
    };

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== null) return;
      const nextWidth = clamp(
        dragState.startWidth + event.clientX - dragState.startX,
        options.collapsedWidth,
        options.maxWidth
      );
      scheduleWidthUpdate(nextWidth);
    };

    const handleMouseUp = () => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== null) return;
      finishDrag();
    };

    const handleBlur = () => finishDrag();

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
      finishDrag();
    };
  }, [finishDrag, options.collapsedWidth, options.maxWidth, scheduleWidthUpdate]);

  const startDrag = useCallback(
    ({ clientX, pointerId, handle }: StartDragOptions) => {
      const startWidth = collapsedRef.current ? options.collapsedWidth : desktopWidthRef.current;
      dragStateRef.current = {
        pointerId,
        startX: clientX,
        startWidth,
        handle,
        previousCursor: document.body.style.cursor,
        previousUserSelect: document.body.style.userSelect,
      };
      pendingWidthRef.current = startWidth;
      setDragWidth(startWidth);
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      handle.closest('.layout-sider')?.classList.add('layout-sider--dragging');
    },
    [options.collapsedWidth]
  );

  const beginResizeDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const button = event.button ?? 0;
      if (options.disabled || (event.pointerType !== 'touch' && button !== 0)) return;
      event.preventDefault();
      startDrag({ clientX: event.clientX, pointerId: event.pointerId, handle: event.currentTarget });
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may be unavailable in older test/browser environments.
      }
    },
    [options.disabled, startDrag]
  );

  const beginMouseResizeDrag = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const button = event.button ?? 0;
      if (options.disabled || button !== 0 || dragStateRef.current) return;
      event.preventDefault();
      startDrag({ clientX: event.clientX, pointerId: null, handle: event.currentTarget });
    },
    [options.disabled, startDrag]
  );

  return {
    collapsed,
    setCollapsed,
    width: dragWidth ?? desktopWidth,
    isDragging,
    beginResizeDrag,
    beginMouseResizeDrag,
  };
}
