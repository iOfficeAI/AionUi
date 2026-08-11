/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, type ReactNode } from 'react';

/**
 * 自定义工具栏插槽的内容结构
 * Custom toolbar slot content structure
 */
export interface PreviewToolbarExtras {
  left?: ReactNode;
  right?: ReactNode;
}

export interface PreviewToolbarExtrasContextValue {
  setExtras: (extras: PreviewToolbarExtras | null) => void;
}

const PreviewToolbarExtrasContext = createContext<PreviewToolbarExtrasContextValue | null>(null);

export const PreviewToolbarExtrasProvider = PreviewToolbarExtrasContext.Provider;

/**
 * 用于在预览内容中设置额外的工具栏元素
 * Hook for preview components to set extra toolbar elements
 */
export const usePreviewToolbarExtras = () => {
  return useContext(PreviewToolbarExtrasContext);
};
