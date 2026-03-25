/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, type ICssTheme } from '@/common/config/storage.ts';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext.tsx';
import { resolveCssByActiveTheme, setExtensionThemesCache } from '@renderer/utils/theme/themeCssSync';
import { Button, Message, Modal } from '@arco-design/web-react';
import { EditTwo, Plus, CheckOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CssThemeModal from './CssThemeModal.tsx';
import { PRESET_THEMES, DEFAULT_THEME_ID } from './presets.ts';
import { BACKGROUND_BLOCK_START, injectBackgroundCssBlock } from './backgroundUtils.ts';
import { resolveExtensionAssetUrl } from '@renderer/utils/platform.ts';

interface ThemePreviewPalette {
  appBg: string;
  headerBg: string;
  sideBg: string;
  mainBg: string;
  border: string;
  accent: string;
  textMuted: string;
  userBubble: string;
  aiBubble: string;
}

const fallbackThemePreviewPaletteByMode: Record<'light' | 'dark', ThemePreviewPalette> = {
  light: {
    appBg: '#f7f8fa',
    headerBg: '#eef1f5',
    sideBg: '#eef1f5',
    mainBg: '#f7f8fa',
    border: '#d9dde5',
    accent: '#3b82f6',
    textMuted: '#8b95a7',
    userBubble: '#dbeafe',
    aiBubble: '#e5e7eb',
  },
  dark: {
    appBg: '#171a1f',
    headerBg: '#1f242d',
    sideBg: '#1f242d',
    mainBg: '#171a1f',
    border: '#303744',
    accent: '#60a5fa',
    textMuted: '#8b95a7',
    userBubble: '#1e3a5f',
    aiBubble: '#2b313c',
  },
};

const stripImportant = (value: string) => value.replace(/\s*!important\s*/gi, '').trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeColorLike = (value: string, fallback: string) => {
  const cleaned = stripImportant(value);
  if (!cleaned) return fallback;
  if (cleaned.includes('{{') || cleaned.includes('}}')) return fallback;
  if (/var\(/i.test(cleaned)) return fallback;
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(cleaned)) {
    return `rgb(${cleaned})`;
  }
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|0?\.\d+|1)$/.test(cleaned)) {
    return `rgba(${cleaned})`;
  }
  return cleaned;
};

const parseCssVarsFromBlocks = (css: string, selector: string) => {
  if (!css) return {};
  const regex = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'gi');
  const map: Record<string, string> = {};
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = regex.exec(css)) !== null) {
    const block = blockMatch[1] || '';
    const varRegex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varRegex.exec(block)) !== null) {
      map[varMatch[1]] = varMatch[2].trim();
    }
  }
  return map;
};

const resolveCssVarValue = (value: string, vars: Record<string, string>, depth = 0): string => {
  if (!value || depth > 6) return value;
  const cleaned = stripImportant(value);
  const match = cleaned.match(/^var\(\s*--([a-zA-Z0-9-_]+)\s*(?:,\s*(.+))?\)$/);
  if (!match) return cleaned;
  const varName = match[1];
  const fallback = match[2]?.trim();
  if (vars[varName]) {
    return resolveCssVarValue(vars[varName], vars, depth + 1);
  }
  if (fallback) {
    return resolveCssVarValue(fallback, vars, depth + 1);
  }
  return cleaned;
};

const readFromVarMap = (vars: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = vars[key];
    if (value) return resolveCssVarValue(value, vars);
  }
  return '';
};

const extractThemePreviewPalette = (css: string, mode: 'light' | 'dark'): ThemePreviewPalette => {
  const modeFallback = fallbackThemePreviewPaletteByMode[mode];
  const rootVars = parseCssVarsFromBlocks(css, ':root');
  const darkVars = {
    ...parseCssVarsFromBlocks(css, "[data-theme='dark']"),
    ...parseCssVarsFromBlocks(css, '[data-theme="dark"]'),
    ...parseCssVarsFromBlocks(css, '[data-theme=dark]'),
  };
  const activeVars = mode === 'dark' ? { ...rootVars, ...darkVars } : rootVars;

  const appBgRaw = readFromVarMap(activeVars, ['bg-1', 'color-bg-1']);
  const panelBgRaw = readFromVarMap(activeVars, ['bg-2', 'color-bg-2', 'fill-1', 'color-fill-1']);
  const borderRaw = readFromVarMap(activeVars, ['bg-3', 'color-border-2', 'border-base']);
  const accentRaw = readFromVarMap(activeVars, ['color-primary', 'color-primary-base', 'primary-6']);
  const textMutedRaw = readFromVarMap(activeVars, ['color-text-3', 'text-secondary', 'color-text-2']);
  const aiBubbleRaw = readFromVarMap(activeVars, ['color-fill-2', 'fill-2', 'bg-2', 'color-bg-2']);
  const userBubbleRaw = readFromVarMap(activeVars, ['color-primary-light-3', 'color-primary-light-2', 'color-primary']);

  return {
    appBg: normalizeColorLike(appBgRaw, modeFallback.appBg),
    headerBg: normalizeColorLike(panelBgRaw, modeFallback.headerBg),
    sideBg: normalizeColorLike(panelBgRaw, modeFallback.sideBg),
    mainBg: normalizeColorLike(appBgRaw, modeFallback.mainBg),
    border: normalizeColorLike(borderRaw, modeFallback.border),
    accent: normalizeColorLike(accentRaw, modeFallback.accent),
    textMuted: normalizeColorLike(textMutedRaw, modeFallback.textMuted),
    userBubble: normalizeColorLike(userBubbleRaw, modeFallback.userBubble),
    aiBubble: normalizeColorLike(aiBubbleRaw, modeFallback.aiBubble),
  };
};

const ThemeLayoutPreview: React.FC<{ palette: ThemePreviewPalette }> = ({ palette }) => {
  return (
    <div className='absolute inset-0 pointer-events-none'>
      <div className='absolute inset-0' style={{ background: palette.appBg }} />
      <div
        className='absolute left-8px right-8px top-8px bottom-8px rounded-8px overflow-hidden border border-solid'
        style={{ borderColor: palette.border, background: palette.mainBg }}
      >
        <div
          className='h-14px border-b border-solid flex items-center px-6px gap-4px'
          style={{ borderColor: palette.border, background: palette.headerBg }}
        >
          <span className='block w-5px h-5px rounded-full' style={{ background: palette.accent, opacity: 0.9 }}></span>
          <span
            className='block w-18px h-4px rounded-full'
            style={{ background: palette.border, opacity: 0.45 }}
          ></span>
          <span
            className='block w-12px h-4px rounded-full ml-auto'
            style={{ background: palette.border, opacity: 0.45 }}
          ></span>
        </div>
        <div style={{ height: 'calc(100% - 14px)', display: 'flex' }}>
          <div
            className='border-r border-solid px-3px py-3px flex flex-col gap-3px'
            style={{ width: '23%', borderColor: palette.border, background: palette.sideBg }}
          >
            <span className='block h-3px rounded-full' style={{ background: palette.textMuted, opacity: 0.4 }}></span>
            <span
              className='block h-3px rounded-full w-4/5'
              style={{ background: palette.textMuted, opacity: 0.33 }}
            ></span>
            <span
              className='block h-3px rounded-full w-3/5'
              style={{ background: palette.textMuted, opacity: 0.28 }}
            ></span>
          </div>
          <div
            className='border-r border-solid px-4px py-4px flex flex-col gap-4px'
            style={{ width: '54%', borderColor: palette.border, background: palette.mainBg }}
          >
            <span
              className='block h-6px rounded-[6px] w-4/5'
              style={{ background: palette.aiBubble, opacity: 0.9 }}
            ></span>
            <span
              className='block h-6px rounded-[6px] w-3/5 self-end'
              style={{ background: palette.userBubble, opacity: 0.95 }}
            ></span>
            <span
              className='block h-6px rounded-[6px] w-2/3'
              style={{ background: palette.aiBubble, opacity: 0.82 }}
            ></span>
          </div>
          <div className='px-3px py-3px flex flex-col gap-3px' style={{ width: '23%', background: palette.sideBg }}>
            <span className='block h-3px rounded-full' style={{ background: palette.textMuted, opacity: 0.36 }}></span>
            <span
              className='block h-3px rounded-full w-5/6'
              style={{ background: palette.textMuted, opacity: 0.3 }}
            ></span>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const { theme: currentTheme } = useThemeContext();
  const [themes, setThemes] = useState<ICssTheme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ICssTheme | null>(null);
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);
  const themePreviewPalettes = useMemo(() => {
    const map = new Map<string, ThemePreviewPalette>();
    themes.forEach((cssTheme) => {
      map.set(cssTheme.id, extractThemePreviewPalette(cssTheme.css || '', currentTheme === 'dark' ? 'dark' : 'light'));
    });
    return map;
  }, [themes, currentTheme]);
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

        // 加载扩展主题 / Load extension-contributed themes
        let extensionThemes: ICssTheme[] = [];
        try {
          const loadedExtensionThemes = await ipcBridge.extensions.getThemes.invoke();
          // Normalize extension asset URLs for current runtime (Electron/WebUI)
          extensionThemes = loadedExtensionThemes.map((theme) => ({
            ...theme,
            cover: resolveExtensionAssetUrl(theme.cover),
          }));
          // Update cache so themeCssSync can resolve extension themes without async IPC
          setExtensionThemesCache(extensionThemes);
        } catch {
          // Extensions not available (e.g., WebUI mode or not initialized yet)
        }

        // 合并预设主题、扩展主题和用户主题，按 ID 去重（先出现的优先）
        // Merge preset, extension, and user themes; deduplicate by ID (first occurrence wins)
        const seenIds = new Set<string>();
        const allThemes: ICssTheme[] = [];
        for (const theme of [...normalizedPresets, ...extensionThemes, ...normalized.filter((t) => !t.isPreset)]) {
          if (!theme?.id || seenIds.has(theme.id)) continue;
          seenIds.add(theme.id);
          allThemes.push(theme);
        }

        const resolvedActiveId = activeId || DEFAULT_THEME_ID;
        const activeTheme = allThemes.find((theme) => theme.id === resolvedActiveId);

        // 如果激活主题不存在（扩展被移除等），回退到默认主题
        // If active theme no longer exists (extension removed etc.), fall back to default
        let effectiveActiveId = resolvedActiveId;
        if (!activeTheme && resolvedActiveId !== DEFAULT_THEME_ID) {
          effectiveActiveId = DEFAULT_THEME_ID;
          // Persist the fallback so we don't repeat this on every mount
          await ConfigStorage.set('css.activeThemeId', effectiveActiveId);
        }

        const expectedCss = resolveCssByActiveTheme(
          effectiveActiveId,
          normalized.filter((theme) => !theme.isPreset)
        );

        setThemes(allThemes);
        setActiveThemeId(effectiveActiveId);

        // Self-heal potential split-brain state (activeThemeId != customCss) caused by partial IPC write failures.
        const savedCustomCss = (await ConfigStorage.get('customCss')) || '';
        if (savedCustomCss !== expectedCss) {
          await ConfigStorage.set('customCss', expectedCss);
          // Only dispatch when CSS actually changed to avoid redundant re-renders
          dispatchCustomCssUpdated(expectedCss);
        }
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

        // Pessimistic UI update to avoid transient flash to previous theme.
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
        const normalizedCss = resolveCssByActiveTheme(
          theme.id,
          themes.filter((item) => !item.isPreset)
        );
        // Use queued, best-effort write function
        await applyThemeCss(normalizedCss, theme.id);
        Message.success(t('settings.cssTheme.applied', { name: theme.name }));
      } catch (error) {
        // applyThemeCss internally handles the UI state recovery now.
        Message.error(t('settings.cssTheme.applyFailed'));
      }
    },
    [applyThemeCss, themes, t]
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
          updatedThemes = themes.map((t) =>
            t.id === editingTheme.id ? { ...t, ...normalizedThemeData, updatedAt: now } : t
          );
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
    <div className='space-y-12px'>
      {/* 标题栏 / Header */}
      <div className='flex items-start md:items-center justify-between gap-8px flex-wrap'>
        <span className='text-14px text-t-secondary leading-22px'>{t('settings.cssTheme.selectOrCustomize')}</span>
        <Button
          type='outline'
          size='small'
          className='rd-18px h-34px px-14px !m-0'
          icon={<Plus theme='outline' size='14' />}
          onClick={handleAddTheme}
        >
          {t('settings.cssTheme.addManually')}
        </Button>
      </div>

      {/* 主题卡片列表 / Theme card list */}
      <div
        className='grid w-full gap-12px'
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        {themes.map((theme) => {
          const previewPalette =
            themePreviewPalettes.get(theme.id) ||
            fallbackThemePreviewPaletteByMode[currentTheme === 'dark' ? 'dark' : 'light'];
          const cardStyle = theme.cover
            ? {
                backgroundImage: `url(${theme.cover})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundColor: previewPalette.appBg,
              }
            : { backgroundColor: previewPalette.appBg };
          return (
            <div
              key={theme.id}
              className={`relative cursor-pointer rounded-12px overflow-hidden border-2 transition-all duration-200 h-112px w-full ${activeThemeId === theme.id ? 'border-[var(--color-primary)]' : 'border-transparent hover:border-border-2'}`}
              style={cardStyle}
              onClick={() => handleSelectTheme(theme)}
              onMouseEnter={() => setHoveredThemeId(theme.id)}
              onMouseLeave={() => setHoveredThemeId(null)}
            >
              {!theme.cover && <ThemeLayoutPreview palette={previewPalette} />}

              {/* 底部渐变遮罩与名称、编辑按钮 / Bottom gradient overlay with name and edit button */}
              <div className='absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between p-8px'>
                <span className='text-13px text-white truncate flex-1'>{theme.name}</span>
                {/* 编辑按钮 / Edit button */}
                {hoveredThemeId === theme.id && (
                  <div
                    className='p-4px rounded-6px bg-white/20 cursor-pointer hover:bg-white/40 transition-colors ml-8px'
                    onClick={(e) => handleEditTheme(theme, e)}
                  >
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
          );
        })}
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
