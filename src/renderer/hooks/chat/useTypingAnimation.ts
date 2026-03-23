/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';

interface UseTypingAnimationOptions {
  content: string; // 原始内容 / Original content
  enabled?: boolean; // 是否启用动画 / Whether to enable animation
  speed?: number; // 打字速度（字符/秒）/ Typing speed (characters per second)
}

/**
 * 流式打字动画 Hook
 * Typing animation Hook
 *
 * 用于实现流式内容的逐字符显示效果，常用于 AI 生成内容的实时展示
 * Used to implement character-by-character display for streaming content, commonly used for real-time AI content display
 *
 * @example
 * ```tsx
 * const { displayedContent, isAnimating } = useTypingAnimation({
 *   content: streamingText,
 *   enabled: viewMode === 'preview',
 *   speed: 50, // 50 字符/秒
 * });
 * ```
 */
export const useTypingAnimation = ({ content, enabled = true, speed = 50 }: UseTypingAnimationOptions) => {
  const [displayedContent, setDisplayedContent] = useState(content); // 当前显示的内容 / Currently displayed content
  const [isAnimating, setIsAnimating] = useState(false); // 是否正在打字动画 / Whether typing animation is active
  const animationFrameRef = useRef<number | null>(null); // 动画帧 ID / Animation frame ID
  const targetContentRef = useRef(content); // 目标内容 / Target content

  useEffect(() => {
    // 如果禁用动画，直接显示完整内容 / If animation disabled, show full content immediately
    if (!enabled) {
      setDisplayedContent(content);
      setIsAnimating(false);
      return;
    }

    targetContentRef.current = content;

    // 如果内容没变化，不做任何事
    // If content unchanged, do nothing
    if (content === displayedContent) {
      return;
    }

    // 如果 displayedContent 是空的，说明是首次加载，直接显示
    // If displayedContent is empty, it's the first load, show immediately
    if (displayedContent.length === 0) {
      setDisplayedContent(content);
      setIsAnimating(false);
      return;
    }

    // 计算内容变化量 / Calculate content change amount
    const contentDiff = content.length - displayedContent.length;

    // 如果内容变短了（删除）或一次性增加了很多内容（超过1000字符），说明不是流式更新
    // 直接显示，不做动画 / If content got shorter or increased by a lot (>1000 chars), show immediately
    // 只有增量更新（每次少量增加）才触发打字动画 / Only trigger typing animation for incremental updates
    if (contentDiff < 0 || contentDiff > 1000) {
      setDisplayedContent(content);
      setIsAnimating(false);
      return;
    }

    // 开始打字动画 / Start typing animation
    setIsAnimating(true);
    let currentIndex = displayedContent.length;
    const targetContent = content;

    // 字符/秒速度 / Characters per second
    const charsPerSecond = speed;
    const msPerChar = 1000 / charsPerSecond;

    let lastTimestamp = performance.now();

    const animate = (timestamp: number) => {
      const elapsed = timestamp - lastTimestamp;

      // 每 msPerChar 毫秒显示一个字符
      // Show one character every msPerChar milliseconds
      if (elapsed >= msPerChar) {
        const charsToAdd = Math.floor(elapsed / msPerChar);
        currentIndex = Math.min(currentIndex + charsToAdd, targetContent.length);
        lastTimestamp = timestamp;

        setDisplayedContent(targetContent.substring(0, currentIndex));

        // 如果还没显示完，继续动画
        // If not finished, continue animation
        if (currentIndex < targetContent.length) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          animationFrameRef.current = null;
        }
      } else {
        // 继续等待
        // Keep waiting
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    // 启动动画
    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // 清理函数
    // Cleanup function
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [content, displayedContent, enabled, speed]);

  return {
    displayedContent,
    isAnimating,
  };
};
