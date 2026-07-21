import { useCallback, useEffect, useRef, useState } from 'react';
import { configService } from '@/common/config/configService';

export type ChatSendKey = 'enter' | 'mod+enter';

/**
 * Shared IME composition + send-key handling for chat inputs (SendBox / GUID).
 * Send key is configurable: Enter (default) or Cmd/Ctrl+Enter.
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);
  const [isComposingState, setIsComposingState] = useState(false);
  const [sendKey, setSendKey] = useState<ChatSendKey>(() => configService.get('chat.sendKey') ?? 'enter');

  useEffect(() => {
    setSendKey(configService.get('chat.sendKey') ?? 'enter');
    return configService.subscribe('chat.sendKey', (value) => {
      setSendKey((value as ChatSendKey | undefined) ?? 'enter');
    });
  }, []);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
      setIsComposingState(true);
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
      setIsComposingState(false);
    },
  };

  const createKeyDownHandler = useCallback(
    (onEnterPress: () => void, onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean) => {
      return (e: React.KeyboardEvent) => {
        if (isComposing.current) return;
        if (onKeyDownIntercept?.(e)) return;

        if (e.key !== 'Enter' || e.shiftKey) return;

        const modHeld = e.metaKey || e.ctrlKey;
        if (sendKey === 'mod+enter') {
          // Enter inserts newline; Cmd/Ctrl+Enter sends
          if (!modHeld) return;
          e.preventDefault();
          onEnterPress();
          return;
        }

        // Default: Enter sends (ignore mod-only so Ctrl+Enter doesn't double-fire oddly)
        if (modHeld) return;
        e.preventDefault();
        onEnterPress();
      };
    },
    [sendKey]
  );

  return {
    isComposing,
    isComposingState,
    compositionHandlers,
    createKeyDownHandler,
    sendKey,
  };
};
