/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { IconProvider, DEFAULT_ICON_CONFIGS } from '@icon-park/react/es/runtime';
import { theme } from '@office-ai/platform';
import { iconColors } from '@/renderer/styles/colors';

type IconParkProps = {
  className?: string;
  strokeWidth?: number;
  fill?: string;
};

const IconParkHOC = <T extends object>(Component: React.FunctionComponent<T>): React.FC<T & IconParkProps> => {
  return (props) => {
    const { className, ...restProps } = props;
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
          fill: iconColors.secondary,
          ...(restProps as T),
          className: `cursor-pointer  ${className || ''}`,
        } as T),
      ]
    );
  };
};

export default IconParkHOC;
