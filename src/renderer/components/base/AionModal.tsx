import type { ModalProps } from '@arco-design/web-react';
import { Modal, Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { Close } from '@icon-park/react';
import classNames from 'classnames';
import type { CSSProperties } from 'react';
import React from 'react';

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

const HEADER_BASE_CLASS = 'flex items-center justify-between pb-20px';
const TITLE_BASE_CLASS = 'text-18px font-500 text-t-primary m-0';
const CLOSE_BUTTON_CLASS = 'w-32px h-32px flex items-center justify-center rd-8px transition-colors duration-200 cursor-pointer border-0 bg-transparent p-0 hover:bg-2 focus:outline-none';
const FOOTER_BASE_CLASS = 'flex-shrink-0 bg-transparent ';

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
  // 处理 contentStyle 配置，转换为 CSS 变量
  const contentBg = contentStyle?.background || 'var(--bg-1)';
  const contentBorderRadius = contentStyle?.borderRadius || '16px';
  const contentPadding = contentStyle?.padding || '0';
  const contentOverflow = contentStyle?.overflow || 'auto';

  const borderRadiusVal = typeof contentBorderRadius === 'number' ? `${contentBorderRadius}px` : contentBorderRadius;
  const paddingVal = typeof contentPadding === 'number' ? `${contentPadding}px` : contentPadding;

  // 处理尺寸
  const modalSize = size ? MODAL_SIZES[size] : undefined;
  const finalStyle: CSSProperties = {
    ...modalSize,
    ...style,
    // 通过 CSS 变量传递样式配置
    ['--aionui-modal-bg' as any]: contentBg,
    ['--aionui-modal-radius' as any]: borderRadiusVal,
    ['--aionui-modal-padding' as any]: paddingVal,
    ['--aionui-modal-overflow' as any]: contentOverflow,
    borderRadius: style?.borderRadius || '16px',
  };

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
  const { t } = useTranslation();

  const footerConfig: ModalFooterConfig | null = React.useMemo(() => {
    if (footer === null) {
      return null;
    }

    // 未提供 footer 时，使用默认模板
    if (footer === undefined) {
      return {
        render: () => (
          <div className='flex justify-end gap-10px'>
            {/* 默认按钮使用国际化文案，保持统一圆角样式 */}
            {/* Default buttons use i18n labels with consistent rounded corners */}
            <Button onClick={onCancel} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
              {props.cancelText || t('common.cancel')}
            </Button>
            <Button type='primary' onClick={props.onOk} loading={props.confirmLoading} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
              {props.okText || t('common.confirm')}
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
      <div className='aionui-modal-wrapper'>
        {renderHeader()}
        <div className='aionui-modal-body-content'>{children}</div>
        {renderFooter()}
      </div>
    </Modal>
  );
};

export default AionModal;
