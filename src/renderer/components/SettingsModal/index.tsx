/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Gemini, Info, LinkCloud, System, Toolkit } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { iconColors } from '@/renderer/theme/colors';
import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import GeminiModalContent from './contents/GeminiModalContent';
import ModelModalContent from './contents/ModelModalContent';
import ToolsModalContent from './contents/ToolsModalContent';
import SystemModalContent from './contents/SystemModalContent';
import AboutModalContent from './contents/AboutModalContent';
type SettingTab = 'gemini' | 'model' | 'tools' | 'system' | 'about';

interface SettingsModalProps {
  visible: boolean;
  onCancel: () => void;
  defaultTab?: SettingTab;
}

interface SubModalProps {
  visible: boolean;
  onCancel: () => void;
  title?: string;
  children: React.ReactNode;
}

// 二级弹窗组件 / Secondary modal component
export const SubModal: React.FC<SubModalProps> = ({ visible, onCancel, title, children }) => {
  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      className='settings-sub-modal'
      style={{
        width: '500px',
        height: '368px',
      }}
      title={title}
    >
      <AionScrollArea className='h-full px-20px pb-16px text-14px text-t-primary'>{children}</AionScrollArea>
    </AionModal>
  );
};

// 主设置弹窗组件 / Main settings modal component
const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onCancel, defaultTab = 'gemini' }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingTab>(defaultTab);

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

  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      className='settings-modal'
      style={{
        width: '880px',
        borderRadius: '16px',
      }}
      title={t('settings.title')}
    >
      <div className='flex h-459px mt-20px overflow-hidden gap-0'>
        {/* 左侧导航菜单 / Left navigation menu */}
        <AionScrollArea className='w-200px flex-shrink-0 b-color-border-2'>
          <div className='flex flex-col gap-2px'>
            {menuItems.map((item) => (
              <div
                key={item.key}
                className={classNames('flex items-center px-14px py-12px rd-8px cursor-pointer transition-all duration-150 select-none', {
                  'bg-aou-2 text-t-primary': activeTab === item.key,
                  'text-t-secondary hover:bg-fill-1': activeTab !== item.key,
                })}
                onClick={() => setActiveTab(item.key)}
              >
                <span className='flex items-center justify-center mr-12px flex-shrink-0 w-20px h-20px'>{item.icon}</span>
                <span className='text-14px font-400 flex-1 lh-20px'>{item.label}</span>
              </div>
            ))}
          </div>
        </AionScrollArea>

        {/* 右侧内容区域 / Right content area */}
        <AionScrollArea className='flex-1 flex flex-col min-h-0 pl-24px gap-16px'>{renderContent()}</AionScrollArea>
      </div>
    </AionModal>
  );
};

export default SettingsModal;
