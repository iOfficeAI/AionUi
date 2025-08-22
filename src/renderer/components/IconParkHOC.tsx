/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { IconProvider, DEFAULT_ICON_CONFIGS } from '@icon-park/react/es/runtime';
import { theme } from '@office-ai/platform';
import { useTextColor } from '../themes/index';

const IconParkHOC = <T extends Record<string, any>>(Component: React.FunctionComponent<T>): React.FC<T> => {
  return (props) => {
    const getTextColor = useTextColor();
    return React.createElement(
      IconProvider,
      {
        value: {
          ...DEFAULT_ICON_CONFIGS,
          size: theme.Size.IconSize.normal,
        },
      },
      [
        React.createElement(Component, {
          key: 'c3',
          strokeWidth: 3,
          fill: (props as any).fill || getTextColor('icon.default', 'textSecondary'),
          ...props,
          className: 'cursor-pointer  ' + ((props as any).className || ''),
        }),
      ]
    );
  };
};

export default IconParkHOC;
