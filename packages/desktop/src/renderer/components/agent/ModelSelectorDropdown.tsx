/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModelSelectorDropdownContext } from './ModelSelectorDropdownContext';

const MENU_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 12;
const PANEL_WIDTH_PX = 380;
const PANEL_MAX_HEIGHT_PX = 520;
const POPUP_Z_INDEX = 1050;

type AnchoredPopupStyle = {
  position: 'fixed';
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
  zIndex: number;
};

function computePopupStyle(trigger: HTMLElement): AnchoredPopupStyle {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(PANEL_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, viewportWidth - width - VIEWPORT_MARGIN_PX));
  const maxHeight = Math.max(160, Math.min(PANEL_MAX_HEIGHT_PX, rect.top - VIEWPORT_MARGIN_PX - MENU_GAP_PX));

  return {
    position: 'fixed',
    left,
    bottom: viewportHeight - rect.top + MENU_GAP_PX,
    width,
    maxHeight,
    zIndex: POPUP_Z_INDEX,
  };
}

export type ModelSelectorDropdownProps = {
  droplist: React.ReactNode;
  children: React.ReactNode;
  /** Mount the panel hidden after layout so the first click only toggles visibility. */
  preload?: boolean;
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * Anchored model picker — portal + fixed coordinates measured from the trigger.
 * Pre-mounts on hover (and optionally via `preload`) so open is instant.
 */
const ModelSelectorDropdown: React.FC<ModelSelectorDropdownProps> = ({
  droplist,
  children,
  preload = false,
  onVisibleChange,
}) => {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<AnchoredPopupStyle | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshStyle = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const nextStyle = computePopupStyle(trigger);
    setPopupStyle(nextStyle);
    return nextStyle;
  }, []);

  const ensureMounted = useCallback(() => {
    if (!refreshStyle()) return;
    setMounted(true);
  }, [refreshStyle]);

  const closePanel = useCallback(() => {
    setOpen(false);
    onVisibleChange?.(false);
  }, [onVisibleChange]);

  const openPanel = useCallback(() => {
    ensureMounted();
    refreshStyle();
    setOpen(true);
    onVisibleChange?.(true);
  }, [ensureMounted, onVisibleChange, refreshStyle]);

  const togglePanel = useCallback(() => {
    if (open) closePanel();
    else openPanel();
  }, [closePanel, open, openPanel]);

  const handlePointerEnter = useCallback(() => {
    ensureMounted();
  }, [ensureMounted]);

  useEffect(() => {
    if (!preload) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => ensureMounted());
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [ensureMounted, preload]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      refreshStyle();
    };

    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, refreshStyle]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      closePanel();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [closePanel, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePanel, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector('input')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const handlePanelClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    if (target?.closest('[data-model-option-row]') || target?.closest('.arco-menu-item:not(.arco-menu-disabled)')) {
      closePanel();
    }
  };

  const contextValue = useMemo(
    () => ({
      close: closePanel,
      active: open,
      panelMaxHeight: popupStyle?.maxHeight ?? PANEL_MAX_HEIGHT_PX,
    }),
    [closePanel, open, popupStyle?.maxHeight]
  );

  const popup =
    mounted && popupStyle
      ? createPortal(
          <div
            ref={panelRef}
            data-model-selector-popup
            style={{
              ...popupStyle,
              display: 'flex',
              flexDirection: 'column',
              // The inner `.panel` owns rounded-corner clipping + drop shadow; keep
              // this wrapper non-clipping so the panel's right border/shadow render.
              overflow: 'visible',
              visibility: open ? 'visible' : 'hidden',
              pointerEvents: open ? 'auto' : 'none',
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handlePanelClick}
          >
            <ModelSelectorDropdownContext.Provider value={contextValue}>
              {droplist}
            </ModelSelectorDropdownContext.Provider>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span ref={triggerRef} className='inline-flex' onPointerEnter={handlePointerEnter} onClick={togglePanel}>
        {children}
      </span>
      {popup}
    </>
  );
};

export default ModelSelectorDropdown;
