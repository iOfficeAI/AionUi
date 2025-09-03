/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation as useOriginalTranslation } from 'react-i18next';

/**
 * Enhanced useTranslation hook that provides T component for auto-styling
 * Usage:
 * const { t, T } = useTranslation();
 * return <T k="conversation.welcome.title" className="text-xl" />
 */
export function useTranslation(ns?: string) {
  const original = useOriginalTranslation(ns);

  // T component with automatic data-i18n-key
  const T = React.useMemo(() => {
    return React.forwardRef<
      HTMLElement,
      {
        k: string;
        values?: Record<string, unknown>;
        as?: keyof JSX.IntrinsicElements;
        enableStyling?: boolean;
        [key: string]: unknown;
      }
    >((props, ref) => {
      const { k, values, as: Component = 'span', enableStyling = true, ...rest } = props;

      const finalProps = {
        ...rest,
        ref,
        ...(enableStyling ? { 'data-i18n-key': k } : {}),
      } as React.HTMLProps<HTMLElement> & { 'data-i18n-key'?: string; ref?: React.Ref<HTMLElement> };

      const content = original.t(k as string, values as any) as unknown as React.ReactNode;
      return React.createElement(Component as any, finalProps, content);
    });
  }, [original.t]);

  return {
    ...original,
    T,
  };
}
