/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const uuid = (length = 8) => {
  try {
    // globalThis.crypto is available in all modern browsers and Node.js 19+
    const crypto = globalThis.crypto;
    if (crypto) {
      if (typeof crypto.randomUUID === 'function' && length >= 36) {
        return crypto.randomUUID();
      }
      if (typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(Math.ceil(length / 2));
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, length);
      }
    }
  } catch {
    // Fallback without crypto
  }

  // Monotonic fallback without cryptographically secure randomness
  const base = Date.now().toString(36);
  return (base + base).slice(0, length);
};

export const parseError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { backendMessage?: unknown; msg?: unknown; message?: unknown };
    if (typeof err.msg === 'string') return err.msg;
    if (typeof err.backendMessage === 'string' && err.backendMessage.trim()) return err.backendMessage;
    if (typeof err.message === 'string') return err.message;
  }

  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

/**
 * 根据语言代码解析为标准化的区域键
 * Resolve language code to standardized locale key
 */
export const resolveLocaleKey = (
  language: string
):
  | 'zh-CN'
  | 'en-US'
  | 'ja-JP'
  | 'zh-TW'
  | 'ko-KR'
  | 'tr-TR'
  | 'ru-RU'
  | 'uk-UA'
  | 'pt-BR'
  | 'de-DE'
  | 'es-ES'
  | 'fa-IR' => {
  const normalized = language.replace(/_/g, '-').toLowerCase();

  if (normalized.startsWith('zh-tw')) return 'zh-TW';
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja-JP';
  if (normalized.startsWith('ko')) return 'ko-KR';
  if (normalized.startsWith('tr')) return 'tr-TR';
  if (normalized.startsWith('ru')) return 'ru-RU';
  if (normalized.startsWith('uk')) return 'uk-UA';
  if (normalized.startsWith('pt')) return 'pt-BR';
  if (normalized.startsWith('de')) return 'de-DE';
  if (normalized.startsWith('es')) return 'es-ES';
  if (normalized.startsWith('fa')) return 'fa-IR';
  return 'en-US';
};
