/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { useCallback, useEffect, useState } from 'react';

/**
 * Chat font scale — independent from the Electron-level UI scale.
 * Multiplies the effective font-size of message content, markdown, and the
 * sendbox input. Does not change UI chrome (sider rows, headers, buttons).
 *
 * Wired to the CSS variable `--chat-font-scale` on :root. Components that
 * want to scale their text consume it via `calc(<base>px * var(--chat-font-scale, 1))`.
 */
export const CHAT_FONT_SCALE_DEFAULT = 1;
export const CHAT_FONT_SCALE_MIN = 0.75;
export const CHAT_FONT_SCALE_MAX = 1.6;
export const CHAT_FONT_SCALE_STEP = 0.05;

const STORAGE_KEY = 'ui.chatFontScale' as const;
const CSS_VAR = '--chat-font-scale';

const clamp = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return CHAT_FONT_SCALE_DEFAULT;
  return Math.min(CHAT_FONT_SCALE_MAX, Math.max(CHAT_FONT_SCALE_MIN, value));
};

const applyCssVar = (value: number): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(CSS_VAR, String(value));
};

const useChatFontScale = (): [number, (scale: number) => Promise<void>] => {
  const [scale, setScaleState] = useState<number>(CHAT_FONT_SCALE_DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stored = await configService.get(STORAGE_KEY);
        if (cancelled) return;
        const next = clamp(typeof stored === 'number' ? stored : Number(stored));
        setScaleState(next);
        applyCssVar(next);
      } catch {
        applyCssVar(CHAT_FONT_SCALE_DEFAULT);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setScale = useCallback(async (next: number) => {
    const clamped = clamp(next);
    setScaleState(clamped);
    applyCssVar(clamped);
    try {
      await configService.set(STORAGE_KEY, clamped);
    } catch (error) {
      console.error('Failed to persist chat font scale:', error);
    }
  }, []);

  return [scale, setScale];
};

export default useChatFontScale;
