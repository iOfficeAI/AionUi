import { useRef, useState } from 'react';

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

  const createKeyDownHandler = (
    onEnterPress: () => void,
    onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean,
    sendKeyModifier?: boolean
  ) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (e.key !== 'Enter' || e.shiftKey) return;

      const hasModifier = e.metaKey || e.ctrlKey;

      if (sendKeyModifier) {
        // Mod+Enter mode: only Mod+Enter sends; bare Enter is a newline
        if (!hasModifier) return;
        if (onKeyDownIntercept?.(e)) return;
        e.preventDefault();
        onEnterPress();
      } else {
        // Default mode: only bare Enter sends; Mod+Enter is a newline
        if (hasModifier) return;
        if (onKeyDownIntercept?.(e)) return;
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    isComposingState,
    compositionHandlers,
    createKeyDownHandler,
  };
};
