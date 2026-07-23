/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SelectionReadButton — floating "朗读选中" button.
 *
 * Shows when the user selects text inside a message (Shadow-DOM-aware via
 * selectionUtils). Positioned to the left of the existing SelectionReplyButton
 * so the two do not overlap. Mounted by MessageList (additive, behind the
 * feature.voiceRead flag).
 */

import { VolumeNotice } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isVoiceReadEnabled } from './featureFlag';
import { findMessageElement, getEffectiveSelection } from './selectionUtils';
import { voiceReadController } from './VoiceReadController';

const BUTTON_HEIGHT = 32;
// Horizontal offset from the selection centre so this button sits clear of
// the existing "Reply" floating button (which is centred on the selection).
const REPLY_BUTTON_OFFSET = 110;

type FloatingPos = { top: number; left: number; text: string };

const SelectionReadButton: React.FC = () => {
  const { t } = useTranslation();
  const [pos, setPos] = useState<FloatingPos | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVoiceReadEnabled()) return;

    let mounted = true;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseUp = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;

      window.setTimeout(() => {
        if (!mounted) return;

        const sel = getEffectiveSelection(e.target);
        if (!sel || sel.isCollapsed) return;
        const text = sel.toString().trim();
        if (!text) return;

        // Only offer reading for selections inside a message bubble.
        if (!findMessageElement(sel)) return;

        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const above = rect.top - BUTTON_HEIGHT - 8;
        const below = rect.bottom + 8;
        const top = above >= 0 ? above : below;

        setPos({
          top,
          left: Math.max(60, Math.min(rect.left + rect.width / 2 - REPLY_BUTTON_OFFSET, window.innerWidth - 60)),
          text,
        });
      }, 20);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      setPos(null);
    };

    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => setPos(null), 100);
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      mounted = false;
      if (scrollTimer) clearTimeout(scrollTimer);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  if (!isVoiceReadEnabled() || !pos) return null;

  return (
    <div
      ref={buttonRef}
      className='fixed z-9999 flex items-center gap-4px px-10px py-6px rd-8px cursor-pointer transition-colors select-none'
      style={{
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        background: 'var(--brand-light)',
        border: '1px solid var(--brand-hover)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
        color: 'var(--brand)',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        voiceReadController.readSelection(pos.text);
        setPos(null);
        window.getSelection()?.removeAllRanges();
      }}
    >
      <VolumeNotice theme='outline' size='14' fill='currentColor' />
      <span className='text-12px font-medium whitespace-nowrap'>
        {t('voiceRead.readSelection', { defaultValue: '朗读选中' })}
      </span>
    </div>
  );
};

export default SelectionReadButton;
