/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

interface TProps extends React.HTMLProps<HTMLSpanElement> {
  /** i18n key to translate */
  k: string;
  /** Values to interpolate */
  values?: Record<string, unknown>;
  /** HTML tag to render (default: 'span') */
  as?: keyof JSX.IntrinsicElements;
  /** Whether to add data-i18n-key attribute for styling (default: true) */
  enableStyling?: boolean;
}

/**
 * T component - Auto translates text and adds data-i18n-key for theme styling
 * Usage: <T k="conversation.welcome.title" className="text-xl" />
 * Usage: <T k="user.name" values={{ name: 'John' }} as="h1" />
 */
export const T: React.FC<TProps> = ({ k, values, as: Component = 'span', enableStyling = true, ...props }) => {
  const { t } = useTranslation();

  const finalProps = {
    ...props,
    ...(enableStyling ? { 'data-i18n-key': k } : {}),
  } as React.HTMLProps<HTMLElement> & { 'data-i18n-key'?: string };

  return React.createElement(Component, finalProps, t(k, values));
};

export default T;
