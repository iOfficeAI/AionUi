/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Search } from '@icon-park/react';
import classNames from 'classnames';
import type { CSSProperties, InputHTMLAttributes, Ref } from 'react';
import React, { forwardRef } from 'react';
import styles from './AionInlineSearchInput.module.css';

/**
 * AionInlineSearchInput —— 下拉列表专用的轻量搜索框
 *
 * 样式基准取自首页 Project 选择下拉曾用的搜索框：浅灰填充、无边框、8px 圆角、
 * 放大镜图标 + 透明输入框，柔和紧凑，适合“点击展开的下拉列表”顶部内嵌使用。
 * 与 AionSearchInput（34px 描边、focus 主色环，适合常驻搜索栏）区分：
 * 常驻列表用 AionSearchInput，点击触发展开的下拉列表用本组件。
 *
 * API 与 AionSearchInput 对齐（value/onChange/placeholder），只负责外观与录入，
 * 过滤/防抖等逻辑仍由调用方持有。
 */
export type AionInlineSearchInputProps = {
  /** 当前输入值（受控） */
  value: string;
  /** 值变化回调，返回最新字符串 */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  disabled?: boolean;
  /** 落在原生 input 上（测试用 fill 需要它指向真实输入框） */
  'data-testid'?: string;
  /** 落在外层容器上，用于定位整块搜索栏 */
  wrapTestId?: string;
  /** 透传给原生 input 的额外属性（如 onKeyDown、aria-label 等） */
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'placeholder' | 'disabled' | 'autoFocus' | 'className'
  >;
};

const AionInlineSearchInput = forwardRef<HTMLInputElement, AionInlineSearchInputProps>((props, ref) => {
  const { value, onChange, placeholder, className, style, autoFocus, disabled, wrapTestId, inputProps } = props;

  return (
    <div className={classNames(styles.searchbar, className)} style={style} data-testid={wrapTestId}>
      <Search theme='outline' size='13' className={styles.icon} fill='currentColor' />
      <input
        {...inputProps}
        ref={ref as Ref<HTMLInputElement>}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        data-testid={props['data-testid']}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
});

AionInlineSearchInput.displayName = 'AionInlineSearchInput';

export default AionInlineSearchInput;
