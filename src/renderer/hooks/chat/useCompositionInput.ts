import { type KeyboardEvent, useRef, useState } from 'react';

type TextHistoryAction = 'undo' | 'redo';

const getTextHistoryAction = (event: KeyboardEvent): TextHistoryAction | null => {
  const key = event.key.toLowerCase();
  const hasCommandModifier = event.metaKey || event.ctrlKey;
  if (!hasCommandModifier || event.altKey) {
    return null;
  }

  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y' && !event.shiftKey && !event.metaKey) {
    return 'redo';
  }

  return null;
};

/**
 * 共享的输入法合成事件处理hook
 * 消除SendBox组件和GUID页面中的IME处理重复代码
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);
  const [isComposingState, setIsComposingState] = useState(false);

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

  const handleUndoRedoKeyDown = (event: KeyboardEvent, onValueChange?: (value: string) => void): boolean => {
    const historyAction = getTextHistoryAction(event);
    if (!historyAction) {
      return false;
    }

    if (!(event.currentTarget instanceof HTMLTextAreaElement || event.currentTarget instanceof HTMLInputElement)) {
      return false;
    }

    if (typeof document.execCommand !== 'function') {
      return false;
    }

    event.preventDefault();
    document.execCommand(historyAction);

    if (onValueChange) {
      const target = event.currentTarget;
      setTimeout(() => {
        onValueChange(target.value);
      }, 0);
    }

    return true;
  };

  const createKeyDownHandler = (
    onEnterPress: () => void,
    onKeyDownIntercept?: (e: KeyboardEvent) => boolean,
    onUndoRedoValueChange?: (value: string) => void
  ) => {
    return (e: KeyboardEvent) => {
      if (isComposing.current) return;
      if (handleUndoRedoKeyDown(e, onUndoRedoValueChange)) return;
      if (onKeyDownIntercept?.(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    isComposingState,
    compositionHandlers,
    handleUndoRedoKeyDown,
    createKeyDownHandler,
  };
};
