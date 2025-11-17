/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionSelect from '@/renderer/components/base/AionSelect';
import { iconColors } from '@/renderer/theme/colors';
import { Gemini, Info, LinkCloud, System, Toolkit } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutModalContent from './contents/AboutModalContent';
import GeminiModalContent from './contents/GeminiModalContent';
import ModelModalContent from './contents/ModelModalContent';
import SystemModalContent from './contents/SystemModalContent';
import ToolsModalContent from './contents/ToolsModalContent';

/**
 * 设置标签页类型 / Settings tab type
 */
export type SettingTab = 'gemini' | 'model' | 'tools' | 'system' | 'about';
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
 */
export const SubModal: React.FC<SubModalProps> = ({ visible, onCancel, title, children }) => {
  return (
    <AionModal visible={visible} onCancel={onCancel} footer={null} className='settings-sub-modal' size='medium' title={title}>
      <AionScrollArea className='h-full px-20px pb-16px text-14px text-t-primary'>{children}</AionScrollArea>
    </AionModal>
  );
};

// 主设置弹窗组件 / Main settings modal component
const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onCancel, defaultTab = 'gemini' }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingTab>(defaultTab);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = useMemo(
    () => [
      {
        key: 'gemini' as SettingTab,
        label: t('settings.gemini'),
        icon: <Gemini theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'model' as SettingTab,
        label: t('settings.model'),
        icon: <LinkCloud theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'tools' as SettingTab,
        label: t('settings.tools'),
        icon: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'system' as SettingTab,
        label: t('settings.system'),
        icon: <System theme='outline' size='20' fill={iconColors.secondary} />,
      },
      {
        key: 'about' as SettingTab,
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
        return <GeminiModalContent />;
      case 'model':
        return <ModelModalContent />;
      case 'tools':
        return <ToolsModalContent />;
      case 'system':
        return <SystemModalContent />;
      case 'about':
        return <AboutModalContent />;
      default:
        return null;
    }
  };

  // 移动端菜单（下拉选择）/ Mobile menu (dropdown select)
  const mobileMenu = (
    <div className='my-16px'>
      <AionSelect size='large' className='!w-full' value={activeTab} onChange={(val) => setActiveTab(val as SettingTab)}>
        {menuItems.map((item) => (
          <AionSelect.Option key={item.key} value={item.key}>
            <div className='flex items-center gap-8px text-14px'>
              <span className='text-16px line-height-[10px]'>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          </AionSelect.Option>
        ))}
      </AionSelect>
    </div>
  );

  // 桌面端菜单（侧边栏）/ Desktop menu (sidebar)
  const desktopMenu = (
    <AionScrollArea className='w-200px flex-shrink-0 b-color-border-2 scrollbar-hide'>
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
    <AionModal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      className='settings-modal'
      style={{
        width: isMobile ? 'min(100vw, 560px)' : '880px',
        maxHeight: isMobile ? '90vh' : undefined,
        borderRadius: '16px',
      }}
      contentStyle={{ padding: isMobile ? '16px' : '24px 24px 32px' }}
      title={t('settings.title')}
    >
      <div className={classNames('overflow-hidden gap-0', isMobile ? 'flex flex-col min-h-0 h-[calc(90vh-80px)]' : 'flex h-459px mt-20px')}>
        {isMobile ? mobileMenu : desktopMenu}

        <AionScrollArea className={classNames('flex-1 min-h-0 scrollbar-hide', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}>{renderContent()}</AionScrollArea>
      </div>
    </AionModal>
  );
};

export default SettingsModal;
