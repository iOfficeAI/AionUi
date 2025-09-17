import { useRef } from 'react';

/**
 * 共享的输入法合成事件处理hook
 * 消除SendBox组件和GUID页面中的IME处理重复代码
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
    },
  };

  const createKeyDownHandler = (onEnterPress: () => void) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    compositionHandlers,
    createKeyDownHandler,
  };
};
