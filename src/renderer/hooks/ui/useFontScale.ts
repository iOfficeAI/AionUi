/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';

const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.3;
const UI_SCALE_STEP = 0.05;

export const FONT_SCALE_DEFAULT = UI_SCALE_DEFAULT;
export const FONT_SCALE_MIN = UI_SCALE_MIN;
export const FONT_SCALE_MAX = UI_SCALE_MAX;
export const FONT_SCALE_STEP = UI_SCALE_STEP;

// 确保缩放值在允许范围内 / Clamp UI scale to allowed range
const clampFontScale = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return FONT_SCALE_DEFAULT;
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
};

const useFontScale = (): [number, (scale: number) => Promise<void>] => {
  const [fontScale, setFontScaleState] = useState(FONT_SCALE_DEFAULT);

  // 从主进程读取当前缩放，保持 UI 与 Electron 同步 / Pull zoom factor from main to keep UI state aligned
  const fetchZoomFactor = useCallback(async () => {
    try {
      const currentFactor = await ipcBridge.application.getZoomFactor.invoke();
      if (typeof currentFactor === 'number') {
        setFontScaleState(clampFontScale(currentFactor));
      }
    } catch (error) {
      console.error('Failed to fetch zoom factor:', error);
    }
  }, []);

  useEffect(() => {
    void fetchZoomFactor();
  }, [fetchZoomFactor]);

  // 乐观更新 slider，同时通知主进程写入 zoom / Optimistically update slider and ask main process to persist zoom
  const setFontScale = useCallback(
    async (nextScale: number) => {
      const clamped = clampFontScale(nextScale);
      setFontScaleState(clamped);
      try {
        const updatedFactor = await ipcBridge.application.setZoomFactor.invoke({ factor: clamped });
        if (typeof updatedFactor === 'number' && updatedFactor !== clamped) {
          setFontScaleState(clampFontScale(updatedFactor));
        }
      } catch (error) {
        console.error('Failed to set zoom factor:', error);
        void fetchZoomFactor();
      }
    },
    [fetchZoomFactor]
  );

  return [fontScale, setFontScale];
};

export { clampFontScale };
export default useFontScale;
