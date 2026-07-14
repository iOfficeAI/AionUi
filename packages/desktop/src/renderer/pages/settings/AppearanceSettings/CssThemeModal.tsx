/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { ipcBridge } from '@/common';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext.tsx';
import { iconColors } from '@renderer/styles/colors';
import { Button, Input, Radio } from '@arco-design/web-react';
import AionModal from '@renderer/components/base/AionModal.tsx';
import { Plus, Delete } from '@icon-park/react';
import CodeMirror from '@uiw/react-codemirror';
import { css as cssLang } from '@codemirror/lang-css';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import { injectBackgroundCssBlock } from './backgroundUtils.ts';

/** CodeMirror 编辑器样式 / CodeMirror editor styles */
const CODE_MIRROR_STYLE: CSSProperties = {
  fontSize: '13px',
  border: '1px solid var(--color-border-2)',
  borderRadius: '6px',
  overflow: 'hidden',
} as const;

/** CodeMirror 基础配置 / CodeMirror basic setup */
const CODE_MIRROR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  dropCursor: false,
  allowMultipleSelections: false,
} as const;

interface CssThemeModalProps {
  visible: boolean;
  theme: Theme | null;
  onClose: () => void;
  onSave: (theme: Omit<Theme, 'id' | 'created_at' | 'updated_at' | 'builtin'>) => void;
  onDelete?: () => void;
}

/**
 * CSS 主题编辑弹窗 / CSS Theme Edit Modal
 * 用于添加或编辑 CSS 皮肤主题 / For adding or editing CSS skin themes
 */
const CssThemeModal: React.FC<CssThemeModalProps> = ({ visible, theme, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const { theme: colorTheme } = useThemeContext();
  const [name, setName] = useState('');
  const [cover, setCover] = useState<string>('');
  const [css, setCss] = useState('');
  const [appearance, setAppearance] = useState<'light' | 'dark'>('light');

  const applyBackgroundImageToCss = useCallback((imageDataUrl: string) => {
    if (!imageDataUrl) return;
    setCss((prevCss) => injectBackgroundCssBlock(prevCss, imageDataUrl));
  }, []);

  // 编辑模式时加载主题数据 / Load theme data in edit mode
  useEffect(() => {
    if (theme) {
      setName(theme.name);
      setCover(theme.cover || '');
      setCss(theme.css || '');
      setAppearance(theme.appearance ?? 'light');
    } else {
      setName('');
      setCover('');
      setCss('');
      setAppearance('light');
    }
  }, [theme, visible]);

  /**
   * 处理封面图片上传 / Handle cover image upload
   */
  const handleCoverUpload = useCallback(async () => {
    try {
      const files = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      });

      if (files && files[0]) {
        // 使用 IPC 读取图片并转换为 base64 / Use IPC to read image and convert to base64
        const base64 = await ipcBridge.fs.getImageBase64.invoke({ path: files[0] });
        if (base64) {
          setCover(base64);
          applyBackgroundImageToCss(base64);
        }
      }
    } catch (error) {
      console.error('Failed to upload cover:', error);
    }
  }, [applyBackgroundImageToCss]);

  /**
   * 处理保存 / Handle save
   */
  const handleSave = useCallback(() => {
    if (!name.trim()) {
      return;
    }
    onSave({
      name: name.trim(),
      cover: cover || undefined,
      css,
      appearance,
      tokens: undefined,
    });
  }, [name, cover, css, appearance, onSave]);

  const isEditing = !!theme;

  return (
    <AionModal
      variant='standard'
      visible={visible}
      header={{
        title: isEditing ? t('settings.cssTheme.editTheme') : t('settings.cssTheme.addToPreset'),
        showClose: true,
      }}
      onCancel={onClose}
      style={{ width: 600 }}
      unmountOnExit
      footer={{
        render: () => (
          <div className='flex justify-between items-center'>
            <div>
              {onDelete && (
                <Button type='text' icon={<Delete theme='outline' size='14' />} onClick={onDelete}>
                  {t('common.delete')}
                </Button>
              )}
            </div>
            <div className='flex gap-10px'>
              <Button onClick={onClose} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
                {t('common.cancel')}
              </Button>
              <Button
                type='primary'
                onClick={handleSave}
                disabled={!name.trim()}
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        ),
      }}
    >
      <div className='space-y-20px'>
        {/* 封面和名称行 / Cover and name row */}
        <div className='flex gap-16px p-16px bg-[var(--fill-1)] rounded-12px'>
          {/* 封面上传 / Cover upload */}
          <div className='flex-shrink-0'>
            <div className='text-13px text-t-secondary mb-8px'>{t('settings.cssTheme.previewCover')}</div>
            <div
              className='w-120px h-80px rounded-8px border border-dashed border-border-2 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-primary)] transition-colors overflow-hidden bg-[var(--fill-0)]'
              onClick={handleCoverUpload}
            >
              {cover ? (
                <img src={cover} alt='cover' className='w-full h-full object-cover' />
              ) : (
                <>
                  <Plus theme='outline' size='20' fill={iconColors.secondary} />
                  <span className='text-12px text-t-secondary mt-4px'>{t('common.upload')}</span>
                </>
              )}
            </div>
          </div>

          {/* 名称和外观 / Name and appearance */}
          <div className='flex-1 flex flex-col gap-12px'>
            <div>
              <div className='text-13px text-t-secondary mb-8px'>
                <span className='text-[var(--color-danger)]'>*</span>
                {t('settings.cssTheme.name')}
              </div>
              <Input
                value={name}
                onChange={setName}
                placeholder={t('settings.cssTheme.namePlaceholder')}
                className='!bg-[var(--fill-0)]'
              />
            </div>
            {/* 外观模式选择 / Appearance mode selector */}
            <div>
              <div className='text-13px text-t-secondary mb-8px'>{t('settings.cssTheme.appearance')}</div>
              <Radio.Group value={appearance} onChange={(val: 'light' | 'dark') => setAppearance(val)}>
                <Radio value='light'>{t('settings.lightMode')}</Radio>
                <Radio value='dark'>{t('settings.darkMode')}</Radio>
              </Radio.Group>
            </div>
          </div>
        </div>

        {/* CSS 代码编辑器 / CSS code editor */}
        <div>
          <div className='text-13px text-t-secondary mb-8px'>{t('settings.cssTheme.cssCode')}</div>
          <CodeMirror
            value={css}
            theme={colorTheme}
            extensions={[cssLang()]}
            onChange={setCss}
            placeholder={`/* ${t('settings.customCssDesc') || 'Enter custom CSS styles here'} */`}
            basicSetup={CODE_MIRROR_BASIC_SETUP}
            style={{ ...CODE_MIRROR_STYLE, minHeight: '200px' }}
            className='[&_.cm-editor]:rounded-[6px]'
            height='200px'
          />
        </div>
      </div>
    </AionModal>
  );
};

export default CssThemeModal;
