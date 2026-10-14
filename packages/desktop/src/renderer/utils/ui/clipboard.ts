/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Copy text to clipboard with fallback for non-secure contexts (e.g. WebUI over HTTP).
 * Uses navigator.clipboard when available, otherwise falls back to document.execCommand('copy').
 */
export const copyText = async (text: string): Promise<void> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('copyText requires a browser environment');
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Secure context but the Clipboard API still rejected (sandboxed iframe
      // without clipboard-write, enterprise policy, unfocused document, etc.).
      // Fall through to the execCommand fallback below.
      console.warn('[copyText] navigator.clipboard.writeText failed, falling back to execCommand:', error);
    }
  }

  // Fallback for non-secure contexts (WebUI over HTTP) or a rejected Clipboard API
  const previousActiveElement = document.activeElement as HTMLElement | null;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const success = document.execCommand('copy');
    if (!success) {
      throw new Error('execCommand copy returned false');
    }
  } finally {
    document.body.removeChild(textArea);
    if (
      previousActiveElement &&
      typeof previousActiveElement.focus === 'function' &&
      document.contains(previousActiveElement)
    ) {
      previousActiveElement.focus();
    }
  }
};
