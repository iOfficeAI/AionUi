/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

/**
 * Typewriter animation hook for placeholder text.
 * @param text - The full text to type out
 * @returns The animated placeholder string
 */
export const useTypewriterPlaceholder = (text: string): string => {
  const [placeholder, setPlaceholder] = useState('');

  useEffect(() => {
    let currentIndex = 0;
    const typingSpeed = 80;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const typeNextChar = () => {
      if (currentIndex <= text.length) {
        setPlaceholder(text.slice(0, currentIndex) + (currentIndex < text.length ? '|' : ''));
        currentIndex++;
      }
    };

    const initialDelay = setTimeout(() => {
      intervalId = setInterval(() => {
        typeNextChar();
        if (currentIndex > text.length) {
          if (intervalId) clearInterval(intervalId);
          setPlaceholder(text);
        }
      }, typingSpeed);
    }, 300);

    return () => {
      clearTimeout(initialDelay);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text]);

  return placeholder;
};
