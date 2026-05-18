import { ConfigStorage } from '@/common/config/storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_GLOBAL_MASCOT_ENABLED,
  DEFAULT_GLOBAL_MASCOT_ID,
  GLOBAL_MASCOT_CHANGED_EVENT,
  resolveGlobalMascotOption,
} from './mascotCatalog';
import styles from './GlobalMascot.module.css';

const IDLE_DELAY_MS = 500;
const MASCOT_OFFSET_LEFT = 12;
const VIEWPORT_MARGIN = 8;

type MascotPlacement = 'above' | 'below';

type MascotPosition = {
  left: number;
  placement: MascotPlacement;
  top: number;
  visible: boolean;
};

const INITIAL_POSITION: MascotPosition = {
  left: VIEWPORT_MARGIN,
  placement: 'above',
  top: VIEWPORT_MARGIN,
  visible: false,
};

const isNode = (value: EventTarget | null): value is Node =>
  Boolean(value) && typeof (value as Node).nodeType === 'number';

const getEventElement = (eventTarget: EventTarget | null): HTMLElement | null => {
  if (!isNode(eventTarget)) return null;
  if (eventTarget.nodeType === Node.ELEMENT_NODE) {
    return eventTarget as HTMLElement;
  }
  if (eventTarget.nodeType === Node.TEXT_NODE) {
    return eventTarget.parentElement;
  }
  return null;
};

const isTrackedInput = (element: HTMLElement): boolean => {
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea';
};

const resolveMascotTarget = (target: EventTarget | null): HTMLElement | null => {
  const element = getEventElement(target);
  if (!element) return null;
  if (isTrackedInput(element)) return element;
  const mascotContainer = element.closest('div[data-mascot="true"]');
  return mascotContainer ? (mascotContainer as HTMLElement) : null;
};

const GlobalMascot: React.FC = () => {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<MascotPosition>(INITIAL_POSITION);
  const [isMascotEnabled, setIsMascotEnabled] = useState(DEFAULT_GLOBAL_MASCOT_ENABLED);
  const [selectedMascotId, setSelectedMascotId] = useState(DEFAULT_GLOBAL_MASCOT_ID);
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const selectedMascot = resolveGlobalMascotOption(selectedMascotId);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const disconnectObserver = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
  }, []);

  const readMascotSize = useCallback(() => {
    const element = mascotRef.current;
    return {
      height: element?.offsetHeight || selectedMascot.frameHeight,
      width: element?.offsetWidth || selectedMascot.frameWidth,
    };
  }, [selectedMascot.frameHeight, selectedMascot.frameWidth]);

  const computePosition = useCallback(
    (target: HTMLElement): Omit<MascotPosition, 'visible'> | null => {
      if (!target.isConnected || !document.contains(target)) {
        return null;
      }

      const rect = target.getBoundingClientRect();
      const { height, width } = readMascotSize();

      let top = rect.top - height;
      let placement: MascotPlacement = 'above';

      if (top < VIEWPORT_MARGIN) {
        top = rect.bottom;
        placement = 'below';
      }

      const unclampedLeft = rect.left + MASCOT_OFFSET_LEFT;
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);

      return {
        left: Math.min(Math.max(unclampedLeft, VIEWPORT_MARGIN), maxLeft),
        placement,
        top: Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop),
      };
    },
    [readMascotSize]
  );

  const hideMascot = useCallback(() => {
    activeTargetRef.current = null;
    disconnectObserver();
    setPosition((current) => (current.visible ? { ...current, visible: false } : current));
  }, [disconnectObserver]);

  const updatePosition = useCallback(() => {
    const target = activeTargetRef.current;
    if (!target) return;

    const next = computePosition(target);
    if (!next) {
      hideMascot();
      return;
    }

    setPosition((current) => {
      if (
        current.left === next.left &&
        current.top === next.top &&
        current.placement === next.placement &&
        current.visible
      ) {
        return current;
      }

      return {
        ...next,
        visible: true,
      };
    });
  }, [computePosition, hideMascot]);

  const schedulePositionUpdate = useCallback(() => {
    clearFrame();
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updatePosition();
    });
  }, [clearFrame, updatePosition]);

  const observeTarget = useCallback(
    (target: HTMLElement | null) => {
      disconnectObserver();
      if (!target || typeof ResizeObserver === 'undefined') {
        return;
      }

      const observer = new ResizeObserver(() => {
        schedulePositionUpdate();
      });
      observer.observe(target);
      resizeObserverRef.current = observer;
    },
    [disconnectObserver, schedulePositionUpdate]
  );

  const activateTarget = useCallback(
    (target: HTMLElement) => {
      clearIdleTimer();
      activeTargetRef.current = target;
      observeTarget(target);
      schedulePositionUpdate();
    },
    [clearIdleTimer, observeTarget, schedulePositionUpdate]
  );

  const scheduleIdle = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      hideMascot();
    }, IDLE_DELAY_MS);
  }, [clearIdleTimer, hideMascot]);

  useEffect(() => {
    const root = document.createElement('div');
    root.dataset.mascotRoot = 'true';
    document.body.appendChild(root);
    setPortalRoot(root);

    return () => {
      root.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([ConfigStorage.get('system.mascotEnabled'), ConfigStorage.get('system.mascotImage')])
      .then(([enabledValue, imageValue]) => {
        if (cancelled) {
          return;
        }
        setIsMascotEnabled(enabledValue ?? DEFAULT_GLOBAL_MASCOT_ENABLED);
        setSelectedMascotId(resolveGlobalMascotOption(imageValue).id);
      })
      .catch(() => {});

    const handleMascotChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean; id?: string } | string | undefined>).detail;
      if (typeof detail === 'string') {
        setSelectedMascotId(resolveGlobalMascotOption(detail).id);
        return;
      }
      if (detail?.enabled !== undefined) {
        setIsMascotEnabled(detail.enabled);
      }
      if (detail?.id) {
        setSelectedMascotId(resolveGlobalMascotOption(detail.id).id);
      }
    };

    window.addEventListener(GLOBAL_MASCOT_CHANGED_EVENT, handleMascotChange as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener(GLOBAL_MASCOT_CHANGED_EVENT, handleMascotChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isMascotEnabled) {
      hideMascot();
      return;
    }

    const initialTarget = resolveMascotTarget(document.activeElement);
    if (initialTarget) {
      activateTarget(initialTarget);
    }
  }, [activateTarget, hideMascot, isMascotEnabled]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!isMascotEnabled) {
        return;
      }
      const pathTarget = (typeof event.composedPath === 'function' ? event.composedPath()[0] : null) ?? event.target;
      const target = resolveMascotTarget(pathTarget);

      if (target) {
        activateTarget(target);
        return;
      }

      scheduleIdle();
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isMascotEnabled) {
        return;
      }
      const nextTarget = resolveMascotTarget(event.relatedTarget);
      if (nextTarget) {
        return;
      }

      scheduleIdle();
    };

    const handleViewportChange = () => {
      if (!isMascotEnabled) return;
      if (!activeTargetRef.current) return;
      schedulePositionUpdate();
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    window.addEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('blur', scheduleIdle);
    document.addEventListener('scroll', handleViewportChange, true);

    return () => {
      clearIdleTimer();
      clearFrame();
      disconnectObserver();
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('blur', scheduleIdle);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [
    activateTarget,
    clearFrame,
    clearIdleTimer,
    disconnectObserver,
    isMascotEnabled,
    scheduleIdle,
    schedulePositionUpdate,
  ]);

  if (!portalRoot || !isMascotEnabled) {
    return null;
  }

  return createPortal(
    <div className={styles.root} aria-hidden='true'>
      <div
        ref={mascotRef}
        data-mascot-id={selectedMascot.id}
        data-placement={position.placement}
        data-state={position.visible ? 'visible' : 'idle'}
        data-testid='global-mascot'
        className={`${styles.mascot} ${position.visible ? styles.visible : styles.idle}`}
        style={{
          height: selectedMascot.frameHeight,
          transform: `translate3d(${position.left}px, ${position.top + (position.visible ? 0 : 10)}px, 0) scale(${position.visible ? 1 : 0.72})`,
          width: selectedMascot.frameWidth,
        }}
      >
        <div className={styles.core}>
          <img className={styles.image} src={selectedMascot.image} alt='' draggable={false} />
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default React.memo(GlobalMascot);
