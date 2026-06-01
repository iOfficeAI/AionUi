/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import { useMessageList } from '@renderer/pages/conversation/Messages/hooks';
import { useConversationContextSafe } from '@renderer/hooks/context/ConversationContext';
import { dispatchChatMessageJump } from '@renderer/utils/chat/chatMinimapEvents';

type ToolMessage = IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall;

type RunningTool = {
  /** Owning message id — used for CHAT_MESSAGE_JUMP_EVENT fallback. */
  messageId: string;
  /**
   * Per-invocation identifier. Tool groups can contain several invocations
   * inside one message; the call id pins us to the specific running one.
   * Phase 4's MessageToolGroupSummary exposes this as `data-tool-id` so the
   * band can scrollIntoView the running row directly.
   */
  callId: string;
  /** When the running tool was first observed in this session. */
  startedAt: number;
  /** Human-readable title to show in the band. */
  title: string;
};

function isToolMessage(msg: TMessage): msg is ToolMessage {
  return msg.type === 'tool_group' || msg.type === 'acp_tool_call' || msg.type === 'tool_call';
}

/**
 * Extract running tools from a single message. A tool_group can contribute
 * more than one running tool (each item carries its own status); tool_call
 * and acp_tool_call contribute at most one.
 */
function extractRunning(msg: ToolMessage): RunningTool[] {
  const baseStartedAt = msg.created_at ?? Date.now();

  if (msg.type === 'tool_group') {
    if (!Array.isArray(msg.content)) return [];
    return msg.content
      .filter((item) => item.status === 'Executing' || item.status === 'Pending' || item.status === 'Confirming')
      .map((item) => ({
        messageId: msg.id,
        callId: item.call_id,
        startedAt: baseStartedAt,
        title: item.description?.trim() || item.name,
      }));
  }

  if (msg.type === 'acp_tool_call') {
    const update = msg.content?.update;
    if (!update) return [];
    if (update.status !== 'pending' && update.status !== 'in_progress') return [];
    return [
      {
        messageId: msg.id,
        callId: update.tool_call_id,
        startedAt: baseStartedAt,
        title: update.title || update.kind,
      },
    ];
  }

  // tool_call
  if (msg.content?.status !== 'running') return [];
  return [
    {
      messageId: msg.id,
      callId: msg.content.call_id || msg.content.name,
      startedAt: baseStartedAt,
      title: msg.content.description?.trim() || msg.content.name,
    },
  ];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const PulseDot: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  // Reuses the global `status-pill-breathe` keyframe defined in messages.css
  // (Phase 4). Same cadence as the inline running tool pill, so the band reads
  // as part of the same visual language rather than a parallel invention.
  return (
    <span
      aria-hidden='true'
      className='inline-block rd-full bg-brand shrink-0'
      style={{
        width: 8,
        height: 8,
        animation: reducedMotion ? 'none' : 'status-pill-breathe 1.6s ease-in-out infinite',
        boxShadow: reducedMotion
          ? undefined
          : '0 0 4px color-mix(in srgb, var(--brand) 50%, transparent)',
      }}
    />
  );
};

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);
  return reduced;
};

/**
 * LiveActivityBand — ambient surface that surfaces the agent's currently-
 * running tools above the composer rail. Returns null when nothing is running
 * so the composer's vertical position never shifts.
 *
 * Reads the message list provided by the platform's MessageListProvider HOC
 * (acp / remote / openclaw / nanobot / aionrs all wrap with the same provider),
 * so the band is naturally platform-agnostic without introducing new state.
 */
const LiveActivityBand: React.FC = () => {
  const { t } = useTranslation();
  const messages = useMessageList();
  const conversationContext = useConversationContextSafe();
  const reducedMotion = usePrefersReducedMotion();

  // Re-render once per second while a tool is running so the elapsed counter
  // ticks. Driven from a single setInterval keyed on whether any tool is
  // running — when nothing is running the interval is cleared.
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = useMemo<RunningTool[]>(() => {
    const out: RunningTool[] = [];
    for (const msg of messages) {
      if (isToolMessage(msg)) out.push(...extractRunning(msg));
    }
    // Newest first.
    out.sort((a, b) => b.startedAt - a.startedAt);
    return out;
  }, [messages]);

  const hasRunning = running.length > 0;

  useEffect(() => {
    if (!hasRunning) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current === null) {
      intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasRunning]);

  // Always-mounted container with a collapsed empty state. This guarantees the
  // composer's vertical position never moves: when no tool is running the
  // wrapper holds `height: 0; padding: 0` and there is no inner content. When
  // a tool starts, the wrapper grows to its natural content height via a CSS
  // transition tied to Phase 0 motion tokens, so the message list above
  // adjusts smoothly rather than snapping. The prompt explicitly authorises
  // this fallback when strict conditional-render zero-shift isn't achievable
  // (the message list's bottom edge would otherwise jump on mount).
  const primary = hasRunning ? running[0] : undefined;
  const others = hasRunning ? running.slice(1) : [];
  const elapsed = primary ? formatElapsed(Date.now() - primary.startedAt) : '';

  const scrollToLive = () => {
    if (!primary) return;
    if (typeof document !== 'undefined') {
      // Phase 4's MessageToolGroupSummary tags each rendered tool row with
      // `data-tool-id={call_id}`, so the band's primary running tool can be
      // brought into view directly without depending on Virtuoso indices.
      const direct = document.querySelector<HTMLElement>(
        `[data-tool-id="${CSS.escape(primary.callId)}"]`
      );
      if (direct) {
        direct.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    // Off-DOM fallback: dispatch the existing minimap jump event with the
    // owning message id. The current MessageList listener skips tool_summary
    // items in processedList, so for tool messages that were rolled into a
    // summary this is a no-op — the band remains visible and the user can
    // scroll manually. A follow-up phase that revisits MessageList's jump
    // handler could resolve this by searching tool_summary.sourceMessageIds.
    if (conversationContext?.conversation_id) {
      dispatchChatMessageJump({
        conversation_id: conversationContext.conversation_id,
        messageId: primary.messageId,
        align: 'center',
        behavior: 'smooth',
      });
    }
  };

  const handleButtonClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    scrollToLive();
  };

  const handleContainerClick: React.MouseEventHandler<HTMLDivElement> = () => {
    scrollToLive();
  };

  const handleContainerKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      scrollToLive();
    }
  };

  const runningLabel = primary
    ? t('messages.liveActivity.running', {
        defaultValue: 'Running: {{title}}',
        title: primary.title,
      })
    : '';
  const jumpLabel = t('messages.liveActivity.jumpTo', { defaultValue: 'Jump to' });
  const jumpAriaLabel = t('messages.liveActivity.jumpToLive', { defaultValue: 'Jump to live tool call' });
  const othersTooltipHeader = t('messages.liveActivity.othersTooltipHeader', {
    defaultValue: 'Also running',
  });
  const othersTooltip =
    others.length > 0 ? (
      <div className='flex flex-col gap-2px'>
        <div className='text-12px opacity-80'>{othersTooltipHeader}</div>
        {others.map((tool) => (
          <div key={tool.messageId + tool.title} className='text-13px'>
            • {tool.title}
          </div>
        ))}
      </div>
    ) : null;

  // Outer wrapper is always mounted with `overflow: hidden`. Its `max-height`
  // transitions between 0 and a value comfortably larger than the band's
  // natural row height (32-40px). Using `max-height` rather than `height` lets
  // the inner content size itself naturally while still animating in/out.
  // Pointer-events are disabled on the empty state so the wrapper doesn't
  // intercept clicks on whatever sits below it visually.
  return (
    <div
      aria-hidden={!hasRunning}
      style={{
        maxHeight: hasRunning ? 80 : 0,
        overflow: 'hidden',
        pointerEvents: hasRunning ? 'auto' : 'none',
        transition: `max-height var(--motion-slow, 320ms) var(--motion-ease-standard, ease)`,
      }}
    >
      <div
        role='status'
        aria-live='polite'
        tabIndex={hasRunning ? 0 : -1}
        onClick={hasRunning ? handleContainerClick : undefined}
        onKeyDown={hasRunning ? handleContainerKeyDown : undefined}
        className='flex items-center gap-8px px-12px py-6px bg-activity-pulse text-brand text-13px cursor-pointer select-none'
        style={{
          borderTop: '1px solid var(--border-light)',
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        <PulseDot reducedMotion={reducedMotion} />
        <span className='truncate min-w-0'>{runningLabel}</span>
        {others.length > 0 && (
          <Tooltip content={othersTooltip} position='top'>
            <span className='text-t-tertiary text-12px shrink-0'>+{others.length}</span>
          </Tooltip>
        )}
        <span
          className='ml-auto text-t-tertiary text-12px shrink-0'
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {elapsed}
        </span>
        <button
          type='button'
          onClick={handleButtonClick}
          className='text-brand text-12px bg-transparent border-none cursor-pointer p-0 shrink-0 hover:underline'
          aria-label={jumpAriaLabel}
        >
          {jumpLabel} →
        </button>
      </div>
    </div>
  );
};

export default LiveActivityBand;
