/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/storage';
import { ipcBridge } from '@/common';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Input } from '@arco-design/web-react';
import AionModal from '@/renderer/components/base/AionModal';
import { Plus, Delete } from '@icon-park/react';
import CodeMirror from '@uiw/react-codemirror';
import { css as cssLang } from '@codemirror/lang-css';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import { injectBackgroundCssBlock } from './backgroundUtils';

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
  theme: ICssTheme | null;
  onClose: () => void;
  onSave: (theme: Omit<ICssTheme, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => void;
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

  const applyBackgroundImageToCss = useCallback((imageDataUrl: string) => {
    if (!imageDataUrl) return;
    setCss((prevCss) => injectBackgroundCssBlock(prevCss, imageDataUrl));
  }, []);

  // 编辑模式时加载主题数据 / Load theme data in edit mode
  useEffect(() => {
    if (theme) {
      setName(theme.name);
      setCover(theme.cover || '');
      setCss(theme.css);
    } else {
      setName('');
      setCover('');
      setCss('');
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
    });
  }, [name, cover, css, onSave]);

  const isEditing = !!theme;

  return (
    <AionModal visible={visible} header={isEditing ? t('settings.cssTheme.editTheme') : t('settings.cssTheme.addToPreset')} onCancel={onClose} footer={null} style={{ width: 600 }} unmountOnExit>
      <div className='space-y-20px'>
        {/* 封面和名称行 / Cover and name row */}
        <div className='flex gap-16px p-16px bg-[var(--fill-1)] rounded-12px'>
          {/* 封面上传 / Cover upload */}
          <div className='flex-shrink-0'>
            <div className='text-13px text-t-secondary mb-8px'>{t('settings.cssTheme.previewCover')}</div>
            <div className='w-120px h-80px rounded-8px border border-dashed border-border-2 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-primary)] transition-colors overflow-hidden bg-[var(--fill-0)]' onClick={handleCoverUpload}>
              {cover ? (
                <img src={cover} alt='cover' className='w-full h-full object-cover' />
              ) : (
                <>
                  <Plus theme='outline' size='20' fill={iconColors.secondary} />
                  <span className='text-12px text-t-secondary mt-4px'>Upload</span>
                </>
              )}
            </div>
          </div>

          {/* 名称输入 / Name input */}
          <div className='flex-1'>
            <div className='text-13px text-t-secondary mb-8px'>
              <span className='text-[var(--color-danger)]'>*</span>
              {t('settings.cssTheme.name')}
            </div>
            <Input value={name} onChange={setName} placeholder={t('settings.cssTheme.namePlaceholder')} className='!bg-[var(--fill-0)]' />
          </div>
        </div>

        {/* CSS 代码编辑器 / CSS code editor */}
        <div>
          <div className='text-13px text-t-secondary mb-8px'>{t('settings.cssTheme.cssCode')}</div>
          <CodeMirror value={css} theme={colorTheme} extensions={[cssLang()]} onChange={setCss} placeholder={`/* ${t('settings.customCssDesc') || '在这里输入自定义 CSS 样式'} */`} basicSetup={CODE_MIRROR_BASIC_SETUP} style={{ ...CODE_MIRROR_STYLE, minHeight: '200px' }} className='[&_.cm-editor]:rounded-[6px]' height='200px' />
        </div>

        {/* 底部操作按钮 / Footer action buttons */}
        <div className='flex justify-between items-center pt-16px border-t border-border-2'>
          <div>
            {onDelete && (
              <Button type='text' icon={<Delete theme='outline' size='14' />} onClick={onDelete}>
                {t('common.delete')}
              </Button>
            )}
          </div>
          <div className='flex gap-10px'>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type='primary' onClick={handleSave} disabled={!name.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </AionModal>
  );
};

export default CssThemeModal;
