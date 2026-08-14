/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { emitter } from '@/renderer/utils/emitter';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useOptionalPreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { openExternalUrl } from '@/renderer/utils/platform';
import { resolveSelectionHttpUrl } from '@/renderer/utils/url';
import { Browser, Earth, Quote } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ReplyPos = { top: number; left: number; text: string; msgId: string; msgPos: string; url: string | null };

/**
 * Get the current selection, checking Shadow DOM roots if needed.
 * MarkdownView renders inside Shadow DOM, so document.getSelection() may
 * return a collapsed/empty selection while the real selection lives inside
 * a shadowRoot.
 */
function getEffectiveSelection(target: EventTarget | null): Selection | null {
  // First try the standard selection
  const docSel = document.getSelection();
  if (docSel && !docSel.isCollapsed && docSel.toString().trim()) {
    return docSel;
  }

  // If standard selection is empty, search for selection inside Shadow DOM
  // Walk up from the mouseup target to find a shadow host
  let el = target instanceof Node ? target : null;
  while (el) {
    if (el instanceof Element && el.shadowRoot) {
      const shadowSel = (el.shadowRoot as unknown as { getSelection?: () => Selection | null }).getSelection?.();
      if (shadowSel && !shadowSel.isCollapsed && shadowSel.toString().trim()) {
        return shadowSel;
      }
    }
    el = el.parentNode;
  }

  return docSel;
}

/**
 * Find the closest message container from a selection's anchor node.
 * Handles both regular DOM and Shadow DOM cases.
 */
function findMessageElement(sel: Selection): Element | null {
  let node: Node | null = sel.anchorNode;
  if (!node) return null;

  // In Shadow DOM, anchorNode is inside the shadow tree.
  // We need to walk up through shadow boundaries to find the message container.
  let el: Element | null = node instanceof Element ? node : node.parentElement;

  // Try finding within current DOM tree first
  const msgEl = el?.closest?.('[id^="message-"]');
  if (msgEl) return msgEl;

  // If not found, walk up through shadow host boundaries
  while (el) {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot) {
      el = root.host;
      const hostMsgEl = el.closest('[id^="message-"]');
      if (hostMsgEl) return hostMsgEl;
    } else {
      break;
    }
  }

  return null;
}

const BUTTON_HEIGHT = 32;

const SelectionReplyButton: React.FC<{ messages: TMessage[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const preview = useOptionalPreviewContext();
  const isMobile = layout?.isMobile ?? false;
  const [pos, setPos] = useState<ReplyPos | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Disable on mobile — conflicts with native text selection menu
    if (isMobile) return;

    let mounted = true;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseUp = (e: MouseEvent) => {
      // Skip if mouseup is on the reply button itself
      if (buttonRef.current?.contains(e.target as Node)) return;

      window.setTimeout(() => {
        if (!mounted) return;

        const sel = getEffectiveSelection(e.target);
        if (!sel || sel.isCollapsed) return;
        const text = sel.toString().trim();
        if (!text) return;

        const msgEl = findMessageElement(sel);
        if (!msgEl) return;

        const msgId = msgEl.id.slice('message-'.length);
        const msg = messagesRef.current.find((m) => m.id === msgId);
        const rect = sel.getRangeAt(0).getBoundingClientRect();

        // Place above selection; if too close to top, place below
        const above = rect.top - BUTTON_HEIGHT - 8;
        const below = rect.bottom + 8;
        const top = above >= 0 ? above : below;

        setPos({
          top,
          left: Math.max(60, Math.min(rect.left + rect.width / 2, window.innerWidth - 60)),
          text,
          msgId,
          msgPos: msg?.position ?? 'left',
          // Resolve here while the live Selection (with its anchor/focus nodes) exists.
          url: resolveSelectionHttpUrl(text, sel.anchorNode, sel.focusNode),
        });
      }, 20);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      setPos(null);
    };

    // Clear floating button on scroll, debounced to avoid clearing during
    // the tiny scrolls that happen while selecting text
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
  }, [isMobile]);

  if (!pos) return null;

  // Resolved http(s) URL for the selection (single URL text, or a link anchor);
  // when present, offer extra open actions.
  const url = pos.url;

  const dismiss = () => {
    setPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const itemClassName =
    'flex items-center gap-4px px-8px py-4px rd-6px cursor-pointer transition-colors whitespace-nowrap hover:bg-[var(--brand-hover)]';

  return (
    <div
      ref={buttonRef}
      className='fixed z-9999 flex items-center gap-2px px-4px py-4px rd-8px select-none'
      style={{
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        background: 'var(--brand-light)',
        border: '1px solid var(--brand-hover)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
        color: 'var(--brand)',
      }}
    >
      <div
        className={itemClassName}
        onMouseDown={(e) => {
          e.preventDefault();
          emitter.emit('sendbox.reply', {
            messageId: pos.msgId,
            content: pos.text,
            position: pos.msgPos as 'left' | 'right' | 'center' | 'pop',
          });
          dismiss();
        }}
      >
        <Quote theme='outline' size='14' fill='currentColor' />
        <span className='text-12px font-medium'>{t('common.reply', { defaultValue: 'Reply' })}</span>
      </div>
      {url && preview && (
        <div
          className={itemClassName}
          onMouseDown={(e) => {
            e.preventDefault();
            preview.openBrowserTab(url);
            dismiss();
          }}
        >
          <Browser theme='outline' size='14' fill='currentColor' />
          <span className='text-12px font-medium'>{t('common.openInBuiltinBrowser')}</span>
        </div>
      )}
      {url && (
        <div
          className={itemClassName}
          onMouseDown={(e) => {
            e.preventDefault();
            void openExternalUrl(url).catch(console.error);
            dismiss();
          }}
        >
          <Earth theme='outline' size='14' fill='currentColor' />
          <span className='text-12px font-medium'>{t('common.openInSystemBrowser')}</span>
        </div>
      )}
    </div>
  );
};

export default SelectionReplyButton;
