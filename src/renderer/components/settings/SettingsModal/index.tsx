/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { Tabs } from '@arco-design/web-react';
import { Computer, Earth, Gemini, Info, LinkCloud, Puzzle, Toolkit } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutModalContent from './contents/AboutModalContent';
import AgentModalContent from './contents/AgentModalContent';
import ExtensionSettingsTabContent from './contents/ExtensionSettingsTabContent';
import GeminiModalContent from './contents/GeminiModalContent';
import ModelModalContent from './contents/ModelModalContent';
import SystemModalContent from './contents/SystemModalContent';
import ToolsModalContent from './contents/ToolsModalContent';
import WebuiModalContent from './contents/WebuiModalContent';
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
 * 内置设置标签页类型 / Built-in settings tab type
 */
export type BuiltinSettingTab = 'gemini' | 'model' | 'agent' | 'tools' | 'webui' | 'system' | 'about';

/**
 * 设置标签页类型（内置 + 扩展）/ Settings tab type (built-in + extension)
 */
export type SettingTab = BuiltinSettingTab | (string & Record<never, never>);

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
    <AionModal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      className='settings-sub-modal'
      size='medium'
      title={title}
    >
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
  const [extensionTabs, setExtensionTabs] = useState<IExtensionSettingsTab[]>([]);

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

  // Fetch extension-contributed settings tabs when modal opens
  useEffect(() => {
    if (!visible) return;
    void extensionsIpc.getSettingsTabs
      .invoke()
      .then((tabs) => {
        setExtensionTabs(tabs ?? []);
      })
      .catch((err) => {
        console.error('[SettingsModal] Failed to load extension settings tabs:', err);
      });
  }, [visible]);

  // 检测是否在 Electron 桌面环境 / Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const { resolveExtTabName } = useExtI18n();

  // Extension tab lookup map for renderContent
  const extensionTabMap = useMemo(() => {
    const map = new Map<string, IExtensionSettingsTab>();
    for (const tab of extensionTabs) {
      map.set(tab.id, tab);
    }
    return map;
  }, [extensionTabs]);

  // 菜单项配置 / Menu items configuration
  // Modal 模式下内置 Tab 子集（不含 display、agent）
  const menuItems = useMemo((): Array<{ key: SettingTab; label: string; icon: React.ReactNode }> => {
    type MenuItem = { key: string; label: string; icon: React.ReactNode };

    // Modal built-in tabs (subset — no display/agent route pages)
    const builtinItems: MenuItem[] = [
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
    ];

    if (isDesktop) {
      builtinItems.push({
        key: 'webui',
        label: t('settings.webui'),
        icon: <Earth theme='outline' size='20' fill={iconColors.secondary} />,
      });
    }

    builtinItems.push(
      {
        key: 'system',
        label: t('settings.system'),
        icon: <Computer theme='outline' size='20' fill={iconColors.secondary} />,
      },
      { key: 'about', label: t('settings.about'), icon: <Info theme='outline' size='20' fill={iconColors.secondary} /> }
    );

    // Extension tabs — position anchoring
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();
    const unanchored: IExtensionSettingsTab[] = [];

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const { anchor, placement } = tab.position;
      const map = placement === 'before' ? beforeMap : afterMap;
      let list = map.get(anchor);
      if (!list) {
        list = [];
        map.set(anchor, list);
      }
      list.push(tab);
    }

    const toMenuItem = (tab: IExtensionSettingsTab): MenuItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        key: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-20px h-20px object-contain' />
        ) : (
          <Puzzle theme='outline' size='20' fill={iconColors.secondary} />
        ),
      };
    };

    // Insert anchored tabs
    for (let i = builtinItems.length - 1; i >= 0; i--) {
      const id = builtinItems[i].key;
      const afters = afterMap.get(id);
      if (afters) builtinItems.splice(i + 1, 0, ...afters.map(toMenuItem));
      const befores = beforeMap.get(id);
      if (befores) builtinItems.splice(i, 0, ...befores.map(toMenuItem));
    }

    // Append unanchored before system
    if (unanchored.length > 0) {
      const sysIdx = builtinItems.findIndex((item) => item.key === 'system');
      const idx = sysIdx >= 0 ? sysIdx : builtinItems.length;
      builtinItems.splice(idx, 0, ...unanchored.map(toMenuItem));
    }

    return builtinItems;
  }, [t, isDesktop, extensionTabs, resolveExtTabName]);

  // Track which extension tabs have been visited (lazy mount + keep-alive)
  const [mountedExtTabs, setMountedExtTabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (extensionTabMap.has(activeTab)) {
      setMountedExtTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab, extensionTabMap]);

  // Reset mounted tabs when modal closes to free memory
  useEffect(() => {
    if (!visible) {
      setMountedExtTabs(new Set());
    }
  }, [visible]);

  // Render built-in tab content (conditional)
  const renderBuiltinContent = () => {
    switch (activeTab) {
      case 'gemini':
        return <GeminiModalContent />;
      case 'model':
        return <ModelModalContent />;
      case 'agent':
        return <AgentModalContent />;
      case 'tools':
        return <ToolsModalContent />;
      case 'webui':
        return <WebuiModalContent />;
      case 'system':
        return <SystemModalContent />;
      case 'about':
        return <AboutModalContent />;
      default:
        // If no built-in match and not an extension tab, return null
        if (!extensionTabMap.has(activeTab)) return null;
        return null;
    }
  };

  // Render keep-alive extension tabs (always mounted once visited, hidden via CSS)
  const renderExtensionTabs = () => {
    return Array.from(mountedExtTabs).map((tabKey) => {
      const extTab = extensionTabMap.get(tabKey);
      if (!extTab) return null;
      const isActive = activeTab === tabKey;
      return (
        <div key={tabKey} className='w-full h-full' style={{ display: isActive ? 'block' : 'none' }}>
          <ExtensionSettingsTabContent
            tabId={extTab.id}
            entryUrl={extTab.entryUrl}
            extensionName={extTab._extensionName}
          />
        </div>
      );
    });
  };

  /**
   * 切换标签页 / Switch tab
   * @param tab - 目标标签页 / Target tab
   */
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  // 移动端菜单（Tabs切换）/ Mobile menu (Tabs)
  const mobileMenu = (
    <div className='mt-16px mb-20px overflow-x-auto'>
      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        type='line'
        size='default'
        className='settings-mobile-tabs [&_.arco-tabs-nav]:border-b-0'
      >
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
            className={classNames(
              'flex items-center px-14px py-10px rd-8px cursor-pointer transition-all duration-150 select-none',
              {
                'bg-aou-2 text-t-primary': activeTab === item.key,
                'text-t-secondary hover:bg-fill-1': activeTab !== item.key,
              }
            )}
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
          width: isMobile
            ? `min(calc(100vw - 32px), ${MODAL_WIDTH.mobile}px)`
            : `clamp(var(--app-min-width, 360px), 100vw, ${MODAL_WIDTH.desktop}px)`,
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

          <AionScrollArea
            className={classNames('flex-1 min-h-0', isMobile ? 'overflow-y-auto' : 'flex flex-col pl-24px gap-16px')}
          >
            {renderBuiltinContent()}
            {renderExtensionTabs()}
          </AionScrollArea>
        </div>
      </AionModal>
    </SettingsViewModeProvider>
  );
};

export default SettingsModal;
