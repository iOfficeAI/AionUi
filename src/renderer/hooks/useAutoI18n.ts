/**
 * 自动为翻译文本添加 data-i18n-key 的工具函数
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 增强的 t 函数，自动添加 data-i18n-key 属性
 * @param key i18n key
 * @param options 翻译选项
 * @param Component 要渲染的组件（默认 'span'）
 * @param props 额外的 props
 */
export const useAutoI18n = () => {
  const { t } = useTranslation();

  const T = (props: { k: string; values?: Record<string, unknown>; as?: keyof JSX.IntrinsicElements; className?: string; style?: React.CSSProperties; [key: string]: unknown }) => {
    const { k, values, as: Component = 'span', className, style, ...rest } = props;

    return React.createElement(
      Component,
      {
        ...rest,
        className,
        style,
        'data-i18n-key': k,
      },
      t(k, values)
    );
  };

  return { t, T };
};

export default useAutoI18n;
