/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useLayoutEffect, useCallback } from 'react';

/**
 * 保持值的最新引用，避免闭包陷阱
 * Keep the latest reference of a value to avoid closure trap
 *
 * @example
 * ```tsx
 * const setContentRef = useLatestRef(setContent);
 * useEffect(() => {
 *   const handler = (text: string) => {
 *     setContentRef.current(text);
 *   };
 *   // ...
 * }, []); // 依赖数组为空，不会因为 setContent 变化而重新注册
 * ```
 *
 * @param value - 需要保持最新引用的值 / The value to keep latest reference
 * @returns 包含最新值的 ref 对象 / A ref object containing the latest value
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  // 使用 useLayoutEffect 确保在渲染完成前同步更新
  // Use useLayoutEffect to ensure synchronous update before render completes
  useLayoutEffect(() => {
    ref.current = value;
  });

  return ref;
}

/**
 * 返回一个稳定的函数引用，但内部始终调用最新的函数
 * Return a stable function reference that always calls the latest function internally
 *
 * @example
 * ```tsx
 * const handleClick = useLatestCallback((text: string) => {
 *   setContent(text); // 始终使用最新的 setContent
 * });
 *
 * useEffect(() => {
 *   setSendBoxHandler(handleClick);
 * }, []); // 依赖数组为空，handleClick 引用始终稳定
 * ```
 *
 * @param fn - 需要保持最新引用的函数 / The function to keep latest reference
 * @returns 稳定的函数包装器 / A stable function wrapper
 */
export function useLatestCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useLatestRef(fn);

  // 返回一个稳定的函数引用（空依赖数组）
  // Return a stable function reference (empty dependency array)
  return useCallback(
    ((...args: any[]) => {
      return ref.current(...args);
    }) as T,
    [] // 依赖数组为空，确保函数引用永远稳定 / Empty deps to ensure stable reference
  );
}
