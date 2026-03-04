import { useRef } from 'react';

/**
 * 检测是否为移动设备
 * 基于用户代理字符串、触摸支持和屏幕尺寸判断
 */
const isMobileDevice = (): boolean => {
  // 检测触摸设备
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  // 检测小屏幕（移动端典型尺寸）
  const isSmallScreen = window.innerWidth <= 768;
  // 检测移动端用户代理
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  
  return (hasTouchScreen && isSmallScreen) || mobileUserAgent;
};

/**
 * 共享的输入法合成事件处理hook
 * 消除SendBox组件和GUID页面中的IME处理重复代码
 * 
 * 键盘行为规则：
 * - 桌面端：Enter 发送，Shift+Enter 换行
 * - 移动端：Enter 换行，点击发送按钮发送（避免误触）
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

  const createKeyDownHandler = (onEnterPress: () => void, onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (onKeyDownIntercept?.(e)) return;
      
      // 移动端：Enter 只换行不发送（让默认行为处理换行）
      if (isMobileDevice()) {
        return;
      }
      
      // 桌面端：Enter 发送，Shift+Enter 换行
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
