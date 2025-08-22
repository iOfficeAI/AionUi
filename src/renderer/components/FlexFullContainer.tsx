/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PropsWithChildren } from 'react';
import React from 'react';

import classNames from 'classnames';

const FlexFullContainer: React.FC<
  PropsWithChildren<{
    className?: string;
    containerClassName?: string;
  }>
> = (props) => {
  return (
    <div className={classNames('flex-1 relative', props.className)}>
      <div className={classNames('absolute size-full', props.containerClassName)}>{props.children}</div>
    </div>
  );
};

export default FlexFullContainer;
