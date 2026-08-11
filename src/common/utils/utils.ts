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
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  if (typeof error === 'object' && error !== null) {
    const err = error as { msg?: unknown; message?: unknown };
    if (typeof err.msg === 'string') return err.msg;
    if (typeof err.message === 'string') return err.message;
  }

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
const normalizeModelKey = (modelName: string): string => modelName.toLowerCase().replace(/[^a-z0-9]/g, '');

const getModelNumericSignature = (modelName: string): string => {
  return (modelName.toLowerCase().match(/\d+/g) ?? []).join('.');
};

const damerauLevenshteinDistance = (source: string, target: string): number => {
  if (source === target) return 0;
  if (source.length === 0) return target.length;
  if (target.length === 0) return source.length;

  const matrix = Array.from({ length: source.length + 1 }, () => Array.from({ length: target.length + 1 }, () => 0));

  for (let row = 0; row <= source.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= target.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );

      if (row > 1 && column > 1 && source[row - 1] === target[column - 2] && source[row - 2] === target[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }

  return matrix[source.length][target.length];
};

/**
 * Resolve a persisted model name against a provider's current model list.
 * Preserves exact matches and safely repairs small typos such as
 * `gml-4.6` -> `glm-4.6` without switching model versions.
 */
export const resolveAvailableModel = (
  requestedModel: string | undefined,
  availableModels: readonly string[]
): string | undefined => {
  if (!requestedModel || availableModels.length === 0) {
    return undefined;
  }

  if (availableModels.includes(requestedModel)) {
    return requestedModel;
  }

  const lowerRequestedModel = requestedModel.toLowerCase();
  const caseInsensitiveMatch = availableModels.find((model) => model.toLowerCase() === lowerRequestedModel);
  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch;
  }

  const normalizedRequestedModel = normalizeModelKey(requestedModel);
  if (!normalizedRequestedModel) {
    return undefined;
  }

  const normalizedMatch = availableModels.find((model) => normalizeModelKey(model) === normalizedRequestedModel);
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const requestedNumericSignature = getModelNumericSignature(requestedModel);
  const typoCandidates = availableModels
    .map((model) => ({
      model,
      numericSignature: getModelNumericSignature(model),
      distance: damerauLevenshteinDistance(normalizeModelKey(model), normalizedRequestedModel),
    }))
    .filter((candidate) => {
      if (candidate.distance > 1) {
        return false;
      }

      return requestedNumericSignature
        ? candidate.numericSignature === requestedNumericSignature
        : candidate.numericSignature.length === 0;
    })
    .toSorted((left, right) => left.distance - right.distance || left.model.localeCompare(right.model));

  if (typoCandidates.length === 0) {
    return undefined;
  }

  if (typoCandidates.length > 1 && typoCandidates[0].distance === typoCandidates[1].distance) {
    return undefined;
  }

  return typoCandidates[0]?.model;
};

export const resolveLocaleKey = (language: string): 'zh-CN' | 'en-US' | 'ja-JP' | 'zh-TW' | 'ko-KR' | 'tr-TR' => {
  const lang = language.toLowerCase();
  if (lang.startsWith('zh-tw')) return 'zh-TW';
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('ja')) return 'ja-JP';
  if (lang.startsWith('ko')) return 'ko-KR';
  if (lang.startsWith('tr')) return 'tr-TR';
  return 'en-US';
};
