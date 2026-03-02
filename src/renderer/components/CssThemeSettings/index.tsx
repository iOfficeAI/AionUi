/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, type ICssTheme } from '@/common/storage';
import { uuid } from '@/common/utils';
import { Button, Message, Modal } from '@arco-design/web-react';
import { EditTwo, Plus, CheckOne } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CssThemeModal from './CssThemeModal';
import { PRESET_THEMES, DEFAULT_THEME_ID } from './presets';
import { BACKGROUND_BLOCK_START, injectBackgroundCssBlock } from './backgroundUtils';

const ensureBackgroundCss = <T extends { id?: string; cover?: string; css: string }>(theme: T): T => {
  // 跳过 Default 主题，不注入背景图 CSS / Skip Default theme, do not inject background CSS
  if (theme.id === DEFAULT_THEME_ID) {
    return theme;
  }
  if (theme.cover && theme.css && !theme.css.includes(BACKGROUND_BLOCK_START)) {
    return { ...theme, css: injectBackgroundCssBlock(theme.css, theme.cover) };
  }
  return theme;
};

const normalizeUserThemes = (themes: ICssTheme[]): { normalized: ICssTheme[]; updated: boolean } => {
  let updated = false;
  const normalized = themes.map((theme) => {
    const nextTheme = ensureBackgroundCss(theme);
    if (nextTheme !== theme) {
      updated = true;
    }
    return nextTheme;
  });
  return { normalized, updated };
};

const dispatchCustomCssUpdated = (css: string) => {
  window.dispatchEvent(new CustomEvent('custom-css-updated', { detail: { customCss: css } }));
};

/**
 * CSS 主题设置组件 / CSS Theme Settings Component
 * 用于管理和切换 CSS 皮肤主题 / For managing and switching CSS skin themes
 */
const CssThemeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [themes, setThemes] = useState<ICssTheme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ICssTheme | null>(null);
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);

  // 加载主题列表和激活状态 / Load theme list and active state
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const savedThemes = (await ConfigStorage.get('css.themes')) || [];
        const { normalized, updated } = normalizeUserThemes(savedThemes);
        const activeId = await ConfigStorage.get('css.activeThemeId');

        if (updated) {
          await ConfigStorage.set(
            'css.themes',
            normalized.filter((t) => !t.isPreset)
          );
        }

        // 对预设主题也应用背景图 CSS 处理 / Apply background CSS processing to preset themes as well
        const normalizedPresets = PRESET_THEMES.map((theme) => ensureBackgroundCss(theme));

        // 合并预设主题和用户主题 / Merge preset themes with user themes
        const allThemes = [...normalizedPresets, ...normalized.filter((t) => !t.isPreset)];

        const resolvedActiveId = activeId || DEFAULT_THEME_ID;
        const activeTheme = allThemes.find((theme) => theme.id === resolvedActiveId);
        const expectedCss = activeTheme?.css || '';

        setThemes(allThemes);
        // 如果没有保存的主题 ID，默认选择 default-theme / Default to default-theme if no saved theme ID
        setActiveThemeId(resolvedActiveId);

        // Self-heal potential split-brain state (activeThemeId != customCss) caused by partial IPC write failures.
        const savedCustomCss = (await ConfigStorage.get('customCss')) || '';
        if (savedCustomCss !== expectedCss) {
          await ConfigStorage.set('customCss', expectedCss);
        }
        // Ensure current page visuals always align with the selected theme after loading settings.
        dispatchCustomCssUpdated(expectedCss);
      } catch (error) {
        console.error('Failed to load CSS themes:', error);
      }
    };
    void loadThemes();
  }, []);

  /**
   * 应用主题 CSS / Apply theme CSS
   */
  // Serial queue to process theme changes in strict order without drops
  const applyQueue = React.useRef<Promise<void>>(Promise.resolve());

  const applyThemeCss = useCallback((css: string, themeId: string) => {
    const task = async () => {
      try {
        // Queued Concurrent Writes: Not strictly atomic, but eliminates client-side async interleaving.
        // True atomicity would require a single RPC/key batch in the main process.
        await Promise.all([ConfigStorage.set('customCss', css), ConfigStorage.set('css.activeThemeId', themeId)]);

        // Pessimistic UI Update - only updates if backend storage succeeded completely
        setActiveThemeId(themeId);
        dispatchCustomCssUpdated(css);
      } catch (error) {
        console.error('Failed to apply theme (IPC/Storage Error). Initiating source-of-truth recovery:', error);

        // Recover state unconditionally from what is actually in storage
        try {
          const realId = (await ConfigStorage.get('css.activeThemeId')) || DEFAULT_THEME_ID;
          const realCss = (await ConfigStorage.get('customCss')) || '';

          // Unconditionally align UI state with the real storage state
          setActiveThemeId(realId);
          dispatchCustomCssUpdated(realCss);
        } catch (syncError) {
          console.error('Fallback sync failed:', syncError);
        }
        throw error;
      }
    };

    applyQueue.current = applyQueue.current.then(task, task);
    return applyQueue.current;
  }, []);
  /**
   * 选择主题 / Select theme
   */
  const handleSelectTheme = useCallback(
    async (theme: ICssTheme) => {
      try {
        // Use queued, best-effort write function
        await applyThemeCss(theme.css, theme.id);
        Message.success(t('settings.cssTheme.applied', { name: theme.name }));
      } catch (error) {
        // applyThemeCss internally handles the UI state recovery now.
        Message.error(t('settings.cssTheme.applyFailed'));
      }
    },
    [applyThemeCss, t]
  );

  /**
   * 打开添加主题弹窗 / Open add theme modal
   */
  const handleAddTheme = useCallback(() => {
    setEditingTheme(null);
    setModalVisible(true);
  }, []);

  /**
   * 打开编辑主题弹窗 / Open edit theme modal
   */
  const handleEditTheme = useCallback((theme: ICssTheme, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTheme(theme);
    setModalVisible(true);
  }, []);

  /**
   * 保存主题 / Save theme
   */
  const handleSaveTheme = useCallback(
    async (themeData: Omit<ICssTheme, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => {
      try {
        const now = Date.now();
        let updatedThemes: ICssTheme[];
        const normalizedThemeData = ensureBackgroundCss(themeData);

        if (editingTheme && !editingTheme.isPreset) {
          // 更新现有用户主题 / Update existing user theme
          updatedThemes = themes.map((t) => (t.id === editingTheme.id ? { ...t, ...normalizedThemeData, updatedAt: now } : t));
        } else {
          // 添加新主题（包括从预设主题编辑创建副本）/ Add new theme (including copy from preset)
          const newTheme: ICssTheme = {
            id: uuid(),
            ...normalizedThemeData,
            isPreset: false,
            createdAt: now,
            updatedAt: now,
          };
          updatedThemes = [...themes, newTheme];
        }

        // 只保存用户主题 / Only save user themes
        const userThemes = updatedThemes.filter((t) => !t.isPreset);
        await ConfigStorage.set('css.themes', userThemes);

        setThemes(updatedThemes);
        setModalVisible(false);
        setEditingTheme(null);
        Message.success(t('common.saveSuccess'));
      } catch (error) {
        console.error('Failed to save theme:', error);
        Message.error(t('common.saveFailed'));
      }
    },
    [editingTheme, themes, t]
  );

  /**
   * 删除主题 / Delete theme
   */
  const handleDeleteTheme = useCallback(
    (themeId: string) => {
      Modal.confirm({
        title: t('common.confirmDelete'),
        content: t('settings.cssTheme.deleteConfirm'),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            const updatedThemes = themes.filter((t) => t.id !== themeId);
            const userThemes = updatedThemes.filter((t) => !t.isPreset);
            await ConfigStorage.set('css.themes', userThemes);

            // 如果删除的是当前激活主题，清除激活状态 / If deleting active theme, clear active state
            if (activeThemeId === themeId) {
              // 删除操作也使用强一致性的状态重置 / Use strongly consistent state reset for delete too
              await applyThemeCss('', '');
            }

            setThemes(updatedThemes);
            setModalVisible(false);
            setEditingTheme(null);
            Message.success(t('common.deleteSuccess'));
          } catch (error) {
            console.error('Failed to delete theme:', error);
            Message.error(t('common.deleteFailed'));
          }
        },
      });
    },
    [themes, activeThemeId, applyThemeCss, t]
  );

  return (
    <div className='space-y-16px'>
      {/* 标题栏 / Header */}
      <div className='flex items-center justify-between'>
        <span className='text-14px text-t-secondary'>{t('settings.cssTheme.selectOrCustomize')}</span>
        <Button type='outline' size='small' className='rd-20px' icon={<Plus theme='outline' size='14' />} onClick={handleAddTheme}>
          {t('settings.cssTheme.addManually')}
        </Button>
      </div>

      {/* 主题卡片列表 / Theme card list */}
      <div className='flex flex-wrap gap-10px'>
        {themes.map((theme) => (
          <div key={theme.id} className={`relative cursor-pointer rounded-12px overflow-hidden border-2 transition-all duration-200 w-180px h-112px ${activeThemeId === theme.id ? 'border-[var(--color-primary)]' : 'border-transparent hover:border-border-2'}`} style={theme.cover ? { backgroundImage: `url(${theme.cover})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: 'var(--fill-1)' } : { backgroundColor: 'var(--fill-1)' }} onClick={() => handleSelectTheme(theme)} onMouseEnter={() => setHoveredThemeId(theme.id)} onMouseLeave={() => setHoveredThemeId(null)}>
            {/* 无封面时显示名称占位 / Show name placeholder when no cover */}
            {!theme.cover && (
              <div className='absolute inset-0 flex items-center justify-center'>
                <span className='text-t-secondary text-14px'>{theme.name}</span>
              </div>
            )}

            {/* 底部渐变遮罩与名称、编辑按钮 / Bottom gradient overlay with name and edit button */}
            <div className='absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between p-8px'>
              <span className='text-13px text-white truncate flex-1'>{theme.name}</span>
              {/* 编辑按钮 / Edit button */}
              {hoveredThemeId === theme.id && (
                <div className='p-4px rounded-6px bg-white/20 cursor-pointer hover:bg-white/40 transition-colors ml-8px' onClick={(e) => handleEditTheme(theme, e)}>
                  <EditTwo theme='outline' size='16' fill='#fff' />
                </div>
              )}
            </div>

            {/* 选中标记 / Selected indicator */}
            {activeThemeId === theme.id && (
              <div className='absolute top-8px right-8px'>
                <CheckOne theme='filled' size='20' fill='var(--color-primary)' />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 主题编辑弹窗 / Theme edit modal */}
      <CssThemeModal
        visible={modalVisible}
        theme={editingTheme}
        onClose={() => {
          setModalVisible(false);
          setEditingTheme(null);
        }}
        onSave={handleSaveTheme}
        onDelete={editingTheme && !editingTheme.isPreset ? () => handleDeleteTheme(editingTheme.id) : undefined}
      />
    </div>
  );
};

export default CssThemeSettings;
