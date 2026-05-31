import { useRef, useState } from 'react';

export type EnterBehavior = 'enterSubmit' | 'enterNewline';

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
    enterBehavior: EnterBehavior = 'enterSubmit'
  ) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (onKeyDownIntercept?.(e)) return;
      const shouldSubmit =
        e.key === 'Enter' && (enterBehavior === 'enterSubmit' ? !e.shiftKey : (e.ctrlKey || e.metaKey) && !e.shiftKey);
      if (shouldSubmit) {
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
