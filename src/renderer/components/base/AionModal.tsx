/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModalProps } from '@arco-design/web-react';
import { Modal, Button } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import classNames from 'classnames';
import type { CSSProperties } from 'react';
import React from 'react';
import { useThemeContext } from '@/renderer/context/ThemeContext';

// ==================== 类型定义导出 ====================

/** 预设尺寸类型 */
export type ModalSize = 'small' | 'medium' | 'large' | 'xlarge' | 'full';

/** 预设尺寸配置 */
export const MODAL_SIZES: Record<ModalSize, { width: string; height?: string }> = {
  small: { width: '400px', height: '300px' },
  medium: { width: '600px', height: '400px' },
  large: { width: '800px', height: '600px' },
  xlarge: { width: '1000px', height: '700px' },
  full: { width: '90vw', height: '90vh' },
};

/** Header 配置 */
export interface ModalHeaderConfig {
  /** 自定义完整 header 内容 */
  render?: () => React.ReactNode;
  /** 标题文本或节点 */
  title?: React.ReactNode;
  /** 是否显示关闭按钮 */
  showClose?: boolean;
  /** 关闭按钮图标 */
  closeIcon?: React.ReactNode;
  /** Header 额外的类名 */
  className?: string;
  /** Header 额外的样式 */
  style?: CSSProperties;
}

/** Footer 配置 */
export interface ModalFooterConfig {
  /** 自定义完整 footer 内容 */
  render?: () => React.ReactNode;
  /** Footer 额外的类名 */
  className?: string;
  /** Footer 额外的样式 */
  style?: CSSProperties;
}

/** Modal 内容区域样式配置 */
export interface ModalContentStyleConfig {
  /** 背景色，默认 var(--bg-1) */
  background?: string;
  /** 圆角大小，默认 16px */
  borderRadius?: string | number;
  /** 内边距，默认 0 */
  padding?: string | number;
  /** 内容区域滚动行为，默认 auto */
  overflow?: 'auto' | 'scroll' | 'hidden' | 'visible';
  /** 内容区域高度（支持 number 或 px 字符串） */
  height?: string | number;
  /** 内容区域最小高度 */
  minHeight?: string | number;
  /** 内容区域最大高度 */
  maxHeight?: string | number;
}

/** AionModal 组件 Props */
export interface AionModalProps extends Omit<ModalProps, 'title' | 'footer'> {
  children?: React.ReactNode;

  /** 预设尺寸，会被 style 中的 width/height 覆盖 */
  size?: ModalSize;

  /** Header 配置，可以是简单的 title 字符串或完整配置对象 */
  header?: React.ReactNode | ModalHeaderConfig;

  /** Footer 配置，可以是 ReactNode 或配置对象 */
  footer?: React.ReactNode | ModalFooterConfig | null;

  /** Modal 内容区域样式配置 */
  contentStyle?: ModalContentStyleConfig;

  // === 向后兼容的 Props ===
  /** @deprecated 请使用 header.title */
  title?: React.ReactNode;
  /** @deprecated 请使用 header.showClose */
  showCustomClose?: boolean;
}

// ==================== 样式常量 / Style Constants ====================

const HEADER_BASE_CLASS = 'flex items-center justify-between pb-20px';
const TITLE_BASE_CLASS = 'text-18px font-500 text-t-primary m-0';
const CLOSE_BUTTON_CLASS = 'w-32px h-32px flex items-center justify-center rd-8px transition-colors duration-200 cursor-pointer border-0 bg-transparent p-0 hover:bg-2 focus:outline-none';
const FOOTER_BASE_CLASS = 'flex-shrink-0 bg-transparent';

/**
 * 自定义模态框组件 / Custom modal component
 *
 * 基于 Arco Design Modal 的封装，提供统一的样式主题、预设尺寸和字体缩放支持
 * Wrapper around Arco Design Modal with unified theme styling, preset sizes, and font scaling support
 *
 * @features
 * - 预设尺寸支持 / Preset size support (small/medium/large/xlarge/full)
 * - 响应字体缩放 / Responsive to font scale changes
 * - 灵活的 header/footer 配置 / Flexible header/footer configuration
 * - 向后兼容旧 API / Backward compatible with old API
 * - 自动视口适配 / Auto viewport adaptation
 *
 * @example
 * ```tsx
 * // 基本用法 / Basic usage
 * <AionModal visible={true} onCancel={handleClose} header="标题">
 *   内容
 * </AionModal>
 *
 * // 预设尺寸 / Preset size
 * <AionModal visible={true} size="large" header="大型弹窗">
 *   内容
 * </AionModal>
 *
 * // 自定义 header / Custom header
 * <AionModal
 *   visible={true}
 *   header={{
 *     title: "自定义标题",
 *     showClose: true,
 *     className: "custom-header"
 *   }}
 * >
 *   内容
 * </AionModal>
 *
 * // 自定义 footer / Custom footer
 * <AionModal
 *   visible={true}
 *   header="标题"
 *   footer={
 *     <div className="flex gap-2">
 *       <Button onClick={handleCancel}>取消</Button>
 *       <Button type="primary" onClick={handleOk}>确定</Button>
 *     </div>
 *   }
 * >
 *   内容
 * </AionModal>
 * ```
 */
const dimensionKeys = ['width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight'] as const;
type DimensionKey = (typeof dimensionKeys)[number];

const formatDimensionValue = (value?: string | number) => {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
};

const AionModal: React.FC<AionModalProps> = ({
  children,
  size,
  header,
  footer,
  contentStyle,
  // 向后兼容
  title,
  showCustomClose = true,
  onCancel,
  className = '',
  style,
  ...props
}) => {
  const { fontScale } = useThemeContext();
  // 处理 contentStyle 配置，转换为 CSS 变量
  const contentBg = contentStyle?.background || 'var(--bg-1)';
  const contentBorderRadius = contentStyle?.borderRadius || '16px';
  const contentPadding = contentStyle?.padding || '0';
  const contentOverflow = contentStyle?.overflow || 'auto';

  const borderRadiusVal = typeof contentBorderRadius === 'number' ? `${contentBorderRadius}px` : contentBorderRadius;
  const paddingVal = typeof contentPadding === 'number' ? `${contentPadding}px` : contentPadding;

  const safeScale = fontScale > 0 ? fontScale : 1;

  const scaleDimension = (value: CSSProperties['width']): CSSProperties['width'] => {
    if (value === undefined || value === null) return value;
    if (typeof value === 'number') {
      return Number((value / safeScale).toFixed(2));
    }
    const match = /^([0-9]+(?:\.[0-9]+)?)px$/i.exec(value.trim());
    if (match) {
      return `${parseFloat(match[1]) / safeScale}px`;
    }
    return value;
  };

  // 处理尺寸缩放 / Handle size scaling
  const modalSize = size ? MODAL_SIZES[size] : undefined;
  const baseStyle: CSSProperties = {
    ...modalSize,
    ...style,
  };

  // 缩放尺寸相关属性（避免副作用）/ Scale size-related properties (avoid side effects)
  type DimensionStyle = Partial<Pick<CSSProperties, DimensionKey>>;
  const scaledStyle: DimensionStyle = {};
  dimensionKeys.forEach((key) => {
    const raw = baseStyle[key];
    if (raw !== undefined) {
      scaledStyle[key] = scaleDimension(raw as CSSProperties['width']) as CSSProperties[DimensionKey];
    }
  });

  const mergedStyle: CSSProperties = {
    ...baseStyle,
    ...scaledStyle,
  };

  // 自动设置最大宽高以适应视口 / Auto set max dimensions to fit viewport
  if (typeof window !== 'undefined') {
    const viewportGap = 32;
    if (!mergedStyle.maxWidth) {
      mergedStyle.maxWidth = `calc(100vw - ${viewportGap}px)`;
    }
    if (!mergedStyle.maxHeight) {
      mergedStyle.maxHeight = `calc(100vh - ${viewportGap}px)`;
    }
  }

  const finalStyle: CSSProperties = {
    ...mergedStyle,
    borderRadius: mergedStyle.borderRadius ?? '16px',
  };

  const bodyInlineStyle = React.useMemo<CSSProperties>(() => {
    const style: CSSProperties = {
      background: contentBg,
      overflow: contentOverflow,
    };

    (['height', 'minHeight', 'maxHeight'] as const).forEach((key) => {
      const value = contentStyle?.[key];
      if (value !== undefined) {
        style[key] = formatDimensionValue(value);
      }
    });

    return style;
  }, [contentBg, paddingVal, contentOverflow, contentStyle?.height, contentStyle?.maxHeight, contentStyle?.minHeight]);

  // 处理 Header 配置（向后兼容）
  const headerConfig: ModalHeaderConfig = React.useMemo(() => {
    // 如果使用新的 header 配置
    if (header !== undefined) {
      // 如果是字符串或 ReactNode，转换为 title 配置
      if (typeof header === 'string' || React.isValidElement(header)) {
        return {
          title: header,
          showClose: true,
        };
      }
      // 如果是配置对象
      return header as ModalHeaderConfig;
    }
    // 向后兼容旧的 title 和 showCustomClose
    return {
      title,
      showClose: showCustomClose,
    };
  }, [header, title, showCustomClose]);

  // 处理 Footer 配置
  const footerConfig: ModalFooterConfig | null = React.useMemo(() => {
    if (footer === null) {
      return null;
    }

    // 未提供 footer 时，使用默认模板
    if (footer === undefined) {
      const cancelLabel = props.cancelText ?? 'Cancel';
      const okLabel = props.okText ?? 'Confirm';
      return {
        render: () => (
          <div className='flex justify-end gap-10px mt-10px'>
            {/* 默认按钮提供统一圆角，文案可通过 cancelText/okText 覆盖 */}
            {/* Default buttons ship with rounded corners; text can be overridden via cancelText/okText */}
            <Button onClick={onCancel} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
              {cancelLabel}
            </Button>
            <Button type='primary' onClick={props.onOk} loading={props.confirmLoading} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
              {okLabel}
            </Button>
          </div>
        ),
      };
    }

    // 如果是 ReactNode，包装为配置对象
    if (React.isValidElement(footer)) {
      return {
        render: () => footer,
      };
    }
    return footer as ModalFooterConfig;
  }, [footer, onCancel, props.cancelText, props.okText, props.onOk, props.confirmLoading]);

  // 渲染 Header
  const renderHeader = () => {
    // 如果提供了自定义 render 函数
    if (headerConfig.render) {
      return (
        <div className={headerConfig.className} style={headerConfig.style}>
          {headerConfig.render()}
        </div>
      );
    }

    // 如果没有 title 也不显示关闭按钮，不渲染 header
    if (!headerConfig.title && !headerConfig.showClose) {
      return null;
    }

    // 默认 header 布局
    const headerClassName = classNames(HEADER_BASE_CLASS, headerConfig.className);

    const headerStyle: CSSProperties = {
      borderBottom: '1px solid var(--bg-3)',
      ...headerConfig.style,
    };

    return (
      <div className={headerClassName} style={headerStyle}>
        {headerConfig.title && <h3 className={TITLE_BASE_CLASS}>{headerConfig.title}</h3>}
        {headerConfig.showClose && (
          <button onClick={onCancel} className={CLOSE_BUTTON_CLASS} aria-label='Close'>
            {headerConfig.closeIcon || <Close size={20} fill='#86909c' />}
          </button>
        )}
      </div>
    );
  };

  // 渲染 Footer
  const renderFooter = () => {
    if (!footerConfig) {
      return null;
    }

    if (footerConfig.render) {
      const footerClassName = classNames(FOOTER_BASE_CLASS, footerConfig.className);
      return (
        <div className={footerClassName} style={footerConfig.style}>
          {footerConfig.render()}
        </div>
      );
    }

    return null;
  };

  return (
    <Modal {...props} title={null} closable={false} footer={null} onCancel={onCancel} className={`aionui-modal ${className}`} style={finalStyle} getPopupContainer={() => document.body}>
      <div className='aionui-modal-wrapper' style={{ borderRadius: borderRadiusVal }}>
        {renderHeader()}
        <div className='aionui-modal-body-content' style={bodyInlineStyle}>
          {children}
        </div>
        {renderFooter()}
      </div>
    </Modal>
  );
};

AionModal.displayName = 'AionModal';

export default AionModal;
