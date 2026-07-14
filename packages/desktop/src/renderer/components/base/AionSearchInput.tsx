/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloseSmall, Search } from '@icon-park/react';
import classNames from 'classnames';
import type { CSSProperties, InputHTMLAttributes, Ref } from 'react';
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AionSearchInput.module.css';

/**
 * AionSearchInput —— 全局统一搜索框
 *
 * 样式基准取自会话记录搜索面板：搜索图标 + 输入框 + 圆形清除按钮，
 * 38px 高、10px 圆角、focus 主色描边。各调用处只需传 placeholder 文案，
 * 搜索逻辑（过滤、防抖、结果展示）仍由调用方持有 —— 本组件只负责外观与录入。
 */
export type AionSearchInputProps = {
  /** 当前输入值（受控） */
  value: string;
  /** 值变化回调，返回最新字符串 */
  onChange: (value: string) => void;
  placeholder?: string;
  /** 是否显示清除按钮（有内容时），默认 true */
  allowClear?: boolean;
  /** 自定义清除逻辑，默认清空为 '' */
  onClear?: () => void;
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

const AionSearchInput = forwardRef<HTMLInputElement, AionSearchInputProps>((props, ref) => {
  const {
    value,
    onChange,
    placeholder,
    allowClear = true,
    onClear,
    className,
    style,
    autoFocus,
    disabled,
    wrapTestId,
    inputProps,
  } = props;
  const { t } = useTranslation();

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  return (
    <div className={classNames(styles.searchbar, className)} style={style} data-testid={wrapTestId}>
      <Search theme='outline' size='14' className={styles.icon} fill='currentColor' />
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
      {allowClear && value ? (
        <button
          type='button'
          className={styles.clearBtn}
          onClick={handleClear}
          aria-label={t('common.clear', { defaultValue: 'Clear' })}
          tabIndex={-1}
        >
          <CloseSmall theme='outline' size='14' fill='currentColor' />
        </button>
      ) : null}
    </div>
  );
});

AionSearchInput.displayName = 'AionSearchInput';

export default AionSearchInput;
