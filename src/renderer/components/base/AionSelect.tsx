/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Select } from '@arco-design/web-react';
import type { SelectProps } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';

interface AionSelectProps extends SelectProps {
  className?: string;
}

const BASE_CLASS = classNames('[&_.arco-select-view]:bg-white', 'dark:[&_.arco-select-view]:bg-[color:var(--color-bg-3)]', '[&_.arco-select-view]:rounded-[4px]', '[&_.arco-select-view]:border', '[&_.arco-select-view]:border-solid', '[&_.arco-select-view]:border-border-2', '[&_.arco-select-view]:shadow-none', '[&_.arco-select-view]:transition-colors', '[&_.arco-select-view:hover]:border-[var(--color-primary)]', '[&_.arco-select-view:focus-within]:border-[var(--color-primary)]', '[&_.arco-select-view-disabled]:bg-[var(--color-bg-2)]', '[&_.arco-select-view-disabled]:opacity-80', 'dark:[&_.arco-select-view-disabled]:bg-[var(--color-bg-4)]');

const defaultGetPopupContainer = (): HTMLElement => {
  // 始终挂载到 body，避免嵌套容器导致 ResizeObserver 循环
  // Always mount popup to body to avoid nested containers triggering ResizeObserver loops
  return document.body;
};

const AionSelect = React.forwardRef<any, AionSelectProps>(({ className, getPopupContainer, ...rest }, ref) => {
  return <Select ref={ref} className={classNames(BASE_CLASS, className)} getPopupContainer={getPopupContainer || defaultGetPopupContainer} {...rest} />;
}) as typeof Select;

AionSelect.displayName = 'AionSelect';

AionSelect.Option = Select.Option;
AionSelect.OptGroup = Select.OptGroup;

export default AionSelect;
