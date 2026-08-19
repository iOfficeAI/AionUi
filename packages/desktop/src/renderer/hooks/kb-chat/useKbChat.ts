/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ipcBridge } from '@/common';

export type KbChatMessage = { role: 'user' | 'assistant'; content: string };

export type KbChatStatus = 'idle' | 'streaming' | 'aborted' | 'error' | 'done';

export type KbChatError = { code: string; message: string };

export type UseKbChatOptions = {
  kbId: string;
  token: string | null | undefined;
};

export type UseKbChatResult = {
  status: KbChatStatus;
  messages: KbChatMessage[];
  send: (question: string) => Promise<void>;
  abort: () => void;
  retry: () => void;
  lastError?: KbChatError;
};

const newRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const useKbChat = ({ kbId, token }: UseKbChatOptions): UseKbChatResult => {
  const [status, setStatus] = useState<KbChatStatus>('idle');
  const [messages, setMessages] = useState<KbChatMessage[]>([]);
  const [lastError, setLastError] = useState<KbChatError | undefined>(undefined);

  const requestIdRef = useRef<string | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null | undefined>(token);
  tokenRef.current = token;
  const kbIdRef = useRef<string>(kbId);
  kbIdRef.current = kbId;
  const threadIdRef = useRef<string>(newRequestId());

  useEffect(() => {
    const offChunk = ipcBridge.kbChat.streamChunk.on((p: unknown) => {
      const payload = p as { requestId: string; content: string };
      if (payload.requestId !== requestIdRef.current) return;
      setMessages((prev) => {
        if (prev.length === 0 || prev[prev.length - 1].role !== 'assistant') {
          return [...prev, { role: 'assistant', content: payload.content }];
        }
        const next = prev.slice();
        next[next.length - 1] = {
          role: 'assistant',
          content: next[next.length - 1].content + payload.content,
        };
        return next;
      });
    });

    const offError = ipcBridge.kbChat.streamError.on((p: unknown) => {
      const payload = p as { requestId: string; code: string; message: string };
      if (payload.requestId !== requestIdRef.current) return;
      setStatus('error');
      setLastError({ code: payload.code, message: payload.message });
    });

    const offEnd = ipcBridge.kbChat.streamEnd.on((p: unknown) => {
      const payload = p as { requestId: string; reason: 'done' | 'aborted' | 'error' };
      if (payload.requestId !== requestIdRef.current) return;
      if (payload.reason === 'done') setStatus('done');
      else if (payload.reason === 'aborted') setStatus('aborted');
    });

    return () => {
      offChunk();
      offError();
      offEnd();
    };
  }, []);

  const abort = useCallback(() => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    void ipcBridge.kbChat.abort.invoke({ requestId });
  }, []);

  const send = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const currentToken = tokenRef.current;
    if (!currentToken) {
      setLastError({ code: 'no_token', message: 'Please sign in first' });
      setStatus('error');
      return;
    }
    const previous = requestIdRef.current;
    if (previous) {
      void ipcBridge.kbChat.abort.invoke({ requestId: previous });
    }

    const requestId = newRequestId();
    requestIdRef.current = requestId;
    lastQuestionRef.current = trimmed;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setStatus('streaming');
    setLastError(undefined);

    const result = await ipcBridge.kbChat.send.invoke({
      requestId,
      kbId: kbIdRef.current,
      question: trimmed,
      threadId: threadIdRef.current,
      token: currentToken,
    });

    if (!result.ok && requestIdRef.current === requestId) {
      const message = (result as { message?: string }).message ?? 'unknown';
      setStatus('error');
      setLastError({ code: 'send_failed', message });
    }
  }, []);

  const retry = useCallback(() => {
    const last = lastQuestionRef.current;
    if (last) void send(last);
  }, [send]);

  useEffect(() => {
    return () => {
      const requestId = requestIdRef.current;
      if (requestId) void ipcBridge.kbChat.abort.invoke({ requestId });
    };
  }, []);

  return { status, messages, send, abort, retry, lastError };
};
