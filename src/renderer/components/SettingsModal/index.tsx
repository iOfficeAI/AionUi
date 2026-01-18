/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/theme/colors';
import { Computer, Gemini, Info, LinkCloud, Toolkit, Robot } from '@icon-park/react';
import { Tabs } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutModalContent from './contents/AboutModalContent';
import AgentModalContent from './contents/AgentModalContent';
import GeminiModalContent from './contents/GeminiModalContent';
import ModelModalContent from './contents/ModelModalContent';
import SystemModalContent from './contents/SystemModalContent';
import ToolsModalContent from './contents/ToolsModalContent';
import { SettingsViewModeProvider } from './settingsViewContext';

// ==================== 常量定义 / Constants ====================

/** 移动端断点（px）/ Mobile breakpoint (px) */
const MOBILE_BREAKPOINT = 768;

/** 侧边栏宽度（px）/ Sidebar width (px) */
const SIDEBAR_WIDTH = 200;

/** Modal 宽度配置 / Modal width configuration */
const MODAL_WIDTH = {
  mobile: 560,
  desktop: 880,
} as const;

/** Modal 高度配置 / Modal height configuration */
const MODAL_HEIGHT = {
  mobile: '90vh',
  mobileContent: 'calc(90vh - 80px)',
  desktop: 459,
} as const;

/** Resize 事件防抖延迟（ms）/ Resize event debounce delay (ms) */
const RESIZE_DEBOUNCE_DELAY = 150;

// ==================== 类型定义 / Type Definitions ====================

/**
 * 设置标签页类型 / Settings tab type
 */
export type SettingTab = 'gemini' | 'model' | 'agent' | 'tools' | 'system' | 'about';

/**
 * 设置弹窗组件属性 / Settings modal component props
 */
interface SettingsModalProps {
  /** 弹窗显示状态 / Modal visibility state */
  visible: boolean;
  /** 关闭回调 / Close callback */
  onCancel: () => void;
  /** 默认选中的标签页 / Default selected tab */
  defaultTab?: SettingTab;
}

/**
 * 二级弹窗组件属性 / Secondary modal component props
 */
interface SubModalProps {
  /** 弹窗显示状态 / Modal visibility state */
  visible: boolean;
  /** 关闭回调 / Close callback */
  onCancel: () => void;
  /** 弹窗标题 / Modal title */
  title?: string;
  /** 子元素 / Children elements */
  children: React.ReactNode;
}

/**
 * 二级弹窗组件 / Secondary modal component
 * 用于设置页面中的次级对话框 / Used for secondary dialogs in settings page
 *
 * @example
 * ```tsx
 * <SubModal visible={showModal} onCancel={handleClose} title="详情">
 *   <div>弹窗内容</div>
 * </SubModal>
 * ```
 */
export const SubModal: React.FC<SubModalProps> = ({ visible, onCancel, title, children }) => {
  return (
    <AionModal visible={visible} onCancel={onCancel} footer={null} className='settings-sub-modal' size='medium' title={title}>
      <AionScrollArea className='h-full px-20px pb-16px text-14px text-t-primary'>{children}</AionScrollArea>
    </AionModal>
  );
};

/**
 * 主设置弹窗组件 / Main settings modal component
 *
 * 提供应用的全局设置界面，包括 Gemini、模型、工具、系统和关于等多个标签页
 * Provides global settings interface with multiple tabs including Gemini, Model, Tools, System and About
 *
 * @features
 * - 响应式设计，移动端使用下拉菜单，桌面端使用侧边栏 / Responsive design with dropdown on mobile and sidebar on desktop
 * - 防抖优化的窗口尺寸监听 / Debounced window resize listener
 * - 标签页状态管理 / Tab state management
 *
 * @example
 * ```tsx
 * const { openSettings, settingsModal } = useSettingsModal();
 * // 打开设置弹窗并跳转到系统设置 / Open settings modal and navigate to system tab
 * openSettings('system');
 * ```
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onCancel, defaultTab = 'gemini' }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingTab>(defaultTab);
  const [isMobile, setIsMobile] = useState(false);
  const resizeTimerRef = useRef<number | undefined>(undefined);

  /**
   * 处理窗口尺寸变化，更新移动端状态
   * Handle window resize and update mobile state
   */
  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
  }, []);

  // 监听窗口尺寸变化（带防抖）/ Listen to window resize (with debounce)
  useEffect(() => {
    // 初始化移动端状态 / Initialize mobile state
    handleResize();

    // 带防抖的 resize 处理器 / Debounced resize handler
    const debouncedResize = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(handleResize, RESIZE_DEBOUNCE_DELAY);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, [handleResize]);

  // 菜单项配置 / Menu items configuration
  const menuItems = useMemo(
    (): Array<{ key: SettingTab; label: string; icon: React.ReactNode }> => [
      {
        key: 'gemini',
        label: t('settings.gemini'),
        icon: <Gemini theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'model',
        label: t('settings.model'),
        icon: <LinkCloud theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'tools',
        label: t('settings.tools'),
        icon: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'system',
        label: t('settings.system'),
        icon: <Computer theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'about',
        label: t('settings.about'),
        icon: <Info theme='outline' size='20' fill={iconColors.secondary} />,
      },
    ],
    [t]
  );

  // 渲染当前选中的设置内容 / Render current selected settings content
  const renderContent = () => {
    switch (activeTab) {
      case 'gemini':
        return <GeminiModalContent onRequestClose={onCancel} />;
      case 'model':
        return <ModelModalContent />;
      case 'agent':
        return <AgentModalContent />;
      case 'tools':
        return <ToolsModalContent />;
      case 'system':
        return <SystemModalContent onRequestClose={onCancel} />;
      case 'about':
        return <AboutModalContent />;
      default:
        return null;
    }
  };

  /**
   * 切换标签页 / Switch tab
   * @param tab - 目标标签页 / Target tab
   */
  const handleTabChange = useCallback((tab: SettingTab) => {
    setActiveTab(tab);
  }, []);

  // 移动端菜单（Tabs切换）/ Mobile menu (Tabs)
  const mobileMenu = (
    <div className='mt-16px mb-20px'>
      <Tabs activeTab={activeTab} onChange={handleTabChange} type='line' size='default' className='settings-mobile-tabs [&_.arco-tabs-nav]:border-b-0'>
        {menuItems.map((item) => (
          <Tabs.TabPane key={item.key} title={item.label} />
        ))}
      </Tabs>
    </div>
  );

  // 桌面端菜单（侧边栏）/ Desktop menu (sidebar)
  const desktopMenu = (
    <AionScrollArea className='flex-shrink-0 b-color-border-2 scrollbar-hide' style={{ width: `${SIDEBAR_WIDTH}px` }}>
      <div className='flex flex-col gap-2px'>
        {menuItems.map((item) => (
          <div
            key={item.key}
            className={classNames('flex items-center px-14px py-10px rd-8px cursor-pointer transition-all duration-150 select-none', {
              'bg-aou-2 text-t-primary': activeTab === item.key,
              'text-t-secondary hover:bg-fill-1': activeTab !== item.key,
            })}
            onClick={() => setActiveTab(item.key)}
          >
            <span className='mr-12px text-16px line-height-[10px]'>{item.icon}</span>
            <span className='text-14px font-500 flex-1 lh-22px'>{item.label}</span>
          </div>
        ))}
      </div>
    </AionScrollArea>
  );

  return (
    <SettingsViewModeProvider value='modal'>
      <AionModal
        visible={visible}
        onCancel={onCancel}
        footer={null}
        className='settings-modal'
        style={{
          width: isMobile ? `clamp(var(--app-min-width, 360px), 100vw, ${MODAL_WIDTH.mobile}px)` : `clamp(var(--app-min-width, 360px), 100vw, ${MODAL_WIDTH.desktop}px)`,
          minWidth: 'var(--app-min-width, 360px)',
          maxHeight: isMobile ? MODAL_HEIGHT.mobile : undefined,
          borderRadius: '16px',
        }}
        contentStyle={{ padding: isMobile ? '16px' : '24px 24px 32px' }}
        title={t('settings.title')}
      >
        <div
          className={classNames('overflow-hidden gap-0', isMobile ? 'flex flex-col min-h-0' : 'flex mt-20px')}
          style={{
            height: isMobile ? MODAL_HEIGHT.mobileContent : `${MODAL_HEIGHT.desktop}px`,
          }}
        >
          {isMobile ? mobileMenu : desktopMenu}

          <AionScrollArea className={classNames('flex-1 min-h-0', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}>{renderContent()}</AionScrollArea>
        </div>
      </AionModal>
    </SettingsViewModeProvider>
  );
};

export default SettingsModal;
