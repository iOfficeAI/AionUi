/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useSideConversationControlSafe } from '@/renderer/pages/conversation/context/SideConversationControlContext';
import { emitter } from '@/renderer/utils/emitter';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Button } from '@arco-design/web-react';
import { Communication, Quote } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ReplyPos = { top: number; left: number; text: string; msgId: string; msgPos: string };

/**
 * Get the current selection, checking Shadow DOM roots if needed.
 * MarkdownView renders inside Shadow DOM, so document.getSelection() may
 * return a collapsed/empty selection while the real selection lives inside
 * a shadowRoot.
 */
function getEffectiveSelection(target: EventTarget | null): Selection | null {
  const docSel = document.getSelection();
  if (docSel && !docSel.isCollapsed && docSel.toString().trim()) {
    return docSel;
  }

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

function findMessageElement(sel: Selection): Element | null {
  let node: Node | null = sel.anchorNode;
  if (!node) return null;

  let el: Element | null = node instanceof Element ? node : node.parentElement;
  const msgEl = el?.closest?.('[id^="message-"]');
  if (msgEl) return msgEl;

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

const TOOLBAR_HEIGHT = 32;

const SelectionReplyButton: React.FC<{ messages: TMessage[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const sideControl = useSideConversationControlSafe();
  const conversationCtx = useConversationContextSafe();
  const isMobile = layout?.isMobile ?? false;
  const [pos, setPos] = useState<ReplyPos | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const toolbarRef = useRef<HTMLDivElement>(null);

  const showAskInSide = Boolean(
    sideControl?.enableSide && sideControl.onAskInSide && !conversationCtx?.isSideConversation
  );

  useEffect(() => {
    if (isMobile) return;

    let mounted = true;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseUp = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;

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
        if (!msg) return;
        const rect = sel.getRangeAt(0).getBoundingClientRect();

        const above = rect.top - TOOLBAR_HEIGHT - 8;
        const below = rect.bottom + 8;
        const top = above >= 0 ? above : below;

        setPos({
          top,
          left: Math.max(80, Math.min(rect.left + rect.width / 2, window.innerWidth - 80)),
          text,
          msgId,
          msgPos: msg?.position ?? 'left',
        });
      }, 20);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
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
  }, [isMobile]);

  if (!pos) return null;

  return (
    <div
      ref={toolbarRef}
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
      <Button
        size='mini'
        type='text'
        className='!text-inherit'
        onMouseDown={(e) => {
          e.preventDefault();
          emitter.emit('sendbox.reply', {
            messageId: pos.msgId,
            content: pos.text,
            position: pos.msgPos as 'left' | 'right' | 'center' | 'pop',
          });
          setPos(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        <span className='inline-flex items-center gap-4px'>
          <Quote theme='outline' size='14' fill='currentColor' />
          <span className='text-12px font-medium whitespace-nowrap'>
            {t('common.reply', { defaultValue: 'Reply' })}
          </span>
        </span>
      </Button>
      {showAskInSide ? (
        <Button
          size='mini'
          type='text'
          className='!text-inherit'
          onMouseDown={(e) => {
            e.preventDefault();
            sideControl?.onAskInSide?.(pos.text);
            setPos(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <span className='inline-flex items-center gap-4px'>
            <Communication theme='outline' size='14' fill='currentColor' />
            <span className='text-12px font-medium whitespace-nowrap'>
              {t('conversation.sideConversation.askInSide')}
            </span>
          </span>
        </Button>
      ) : null}
    </div>
  );
};

export default SelectionReplyButton;
