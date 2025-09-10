/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const uuid = (length = 8) => {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
};

export const parseError = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return error.msg || error.message || JSON.stringify(error);
};
