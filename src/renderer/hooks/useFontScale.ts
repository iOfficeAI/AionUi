/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/storage';
import { useCallback, useEffect, useState } from 'react';

// 字体缩放配置常量 / Font scale configuration constants
export const FONT_SCALE_DEFAULT = 1;
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.5;
export const FONT_SCALE_STEP = 0.05;

// 将输入值限制在允许区间 / Clamp scale value into allowed range
const clampFontScale = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return FONT_SCALE_DEFAULT;
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
};

// 将缩放即时应用到 DOM，兼容 React 与系统字体变化 / Apply scale to DOM to sync UI immediately
const applyFontScale = (scale: number) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-font-scale', scale.toFixed(2));
  document.documentElement.style.setProperty('--app-font-scale', scale.toString());

  const setBodyZoom = () => {
    if (document.body) {
      document.body.style.setProperty('zoom', scale.toString());
    } else {
      requestAnimationFrame(setBodyZoom);
    }
  };

  setBodyZoom();
};

// 初始化阶段加载缓存的缩放值 / Load persisted font scale during initialization
const initFontScale = async () => {
  try {
    const storedValue = (await ConfigStorage.get('ui.fontScale')) as number | undefined;
    const scale = clampFontScale(typeof storedValue === 'number' ? storedValue : FONT_SCALE_DEFAULT);
    applyFontScale(scale);
    return scale;
  } catch (error) {
    console.error('Failed to load font scale:', error);
    applyFontScale(FONT_SCALE_DEFAULT);
    return FONT_SCALE_DEFAULT;
  }
};

let initialFontScalePromise: Promise<number> | null = null;
if (typeof window !== 'undefined') {
  // 提前触发一次读取，确保首屏渲染前字体已调整 / Trigger early read so first paint already respects scale
  initialFontScalePromise = initFontScale();
}

const useFontScale = (): [number, (scale: number) => Promise<void>] => {
  const [fontScale, setFontScaleState] = useState(FONT_SCALE_DEFAULT);

  // 更新缩放并持久化 / Update UI scale and persist it
  const setFontScale = useCallback(async (nextScale: number) => {
    const clamped = clampFontScale(nextScale);
    setFontScaleState(clamped);
    applyFontScale(clamped);
    try {
      await ConfigStorage.set('ui.fontScale', clamped);
    } catch (error) {
      console.error('Failed to save font scale:', error);
    }
  }, []);

  useEffect(() => {
    if (initialFontScalePromise) {
      initialFontScalePromise
        .then((value) => {
          setFontScaleState(value);
        })
        .catch((error) => {
          console.error('Failed to initialize font scale:', error);
        });
    }
  }, []);

  return [fontScale, setFontScale];
};

export { clampFontScale };
export default useFontScale;
