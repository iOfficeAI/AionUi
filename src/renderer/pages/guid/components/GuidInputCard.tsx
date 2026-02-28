/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FilePreview from '@/renderer/components/FilePreview';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/useCompositionInput';
import { Input, Tooltip } from '@arco-design/web-react';
import { IconClose } from '@arco-design/web-react/icon';
import { FolderOpen } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidInputCardProps = {
  // Input state
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste: React.ClipboardEventHandler;
  onFocus: () => void;
  onBlur: () => void;
  placeholder: string;

  // Styling
  isInputActive: boolean;
  isFileDragging: boolean;
  activeBorderColor: string;
  inactiveBorderColor: string;
  activeShadow: string;
  dragHandlers: Record<string, any>;

  // Mention state
  mentionOpen: boolean;
  mentionSelectorBadge: React.ReactNode;
  mentionDropdown: React.ReactNode;

  // Files
  files: string[];
  onRemoveFile: (path: string) => void;

  // Workspace
  dir: string;
  onClearDir: () => void;

  // Action row
  actionRow: React.ReactNode;
};

const GuidInputCard: React.FC<GuidInputCardProps> = ({ input, onInputChange, onKeyDown, onPaste, onFocus, onBlur, placeholder, isInputActive, isFileDragging, activeBorderColor, inactiveBorderColor, activeShadow, dragHandlers, mentionOpen, mentionSelectorBadge, mentionDropdown, files, onRemoveFile, dir, onClearDir, actionRow }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { t } = useTranslation();
  const { compositionHandlers, isComposing } = useCompositionInput();
  const textareaAutoSize = isMobile
    ? { minRows: 2, maxRows: 8 }
    : { minRows: 3, maxRows: 20 };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return;
    onKeyDown(e);
  };

  return (
    <div
      className={`${styles.guidInputCard} relative p-16px ${dir ? 'pb-8px' : ''} border-3 b bg-dialog-fill-0 b-solid rd-20px flex flex-col ${mentionOpen ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 ${isFileDragging ? 'border-dashed' : ''}`}
      style={{
        zIndex: 1,
        transition: 'box-shadow 0.25s ease, border-color 0.25s ease, border-width 0.25s ease',
        ...(isFileDragging
          ? {
              backgroundColor: 'var(--color-primary-light-1)',
              borderColor: 'rgb(var(--primary-3))',
              borderWidth: '1px',
            }
          : {
              borderWidth: '1px',
              borderColor: isInputActive ? activeBorderColor : inactiveBorderColor,
              boxShadow: isInputActive ? activeShadow : 'none',
            }),
      }}
      {...dragHandlers}
    >
      {mentionSelectorBadge}
      <Input.TextArea autoSize={textareaAutoSize} placeholder={placeholder} className={`text-16px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !p-0 ${styles.lightPlaceholder}`} value={input} onChange={onInputChange} onPaste={onPaste} onFocus={onFocus} onBlur={onBlur} {...compositionHandlers} onKeyDown={handleKeyDown} />
      {mentionOpen && (
        <div className='absolute z-50' style={{ left: 16, top: 44 }}>
          {mentionDropdown}
        </div>
      )}
      {files.length > 0 && (
        <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px'>
          {files.map((path) => (
            <FilePreview key={path} path={path} onRemove={() => onRemoveFile(path)} />
          ))}
        </div>
      )}
      {actionRow}
      {dir && (
        <div className='flex items-start justify-between gap-10px mt-8px px-10px py-6px text-13px text-t-secondary' style={{ borderTop: '1px solid var(--border-base)' }}>
          <div className='flex items-start min-w-0 flex-1 gap-8px'>
            <FolderOpen className='mt-1px flex-shrink-0' theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
            <Tooltip content={dir} position='top' disabled={isMobile}>
              <span className='block min-w-0 whitespace-normal break-all leading-18px'>
                {isMobile ? (
                  <span className='text-12px lh-18px'>{dir}</span>
                ) : (
                  <>
                    {t('conversation.welcome.currentWorkspace')}: {dir}
                  </>
                )}
              </span>
            </Tooltip>
          </div>
          <Tooltip content={t('conversation.welcome.clearWorkspace')} position='top' disabled={isMobile}>
            <button type='button' className='mt-1px h-28px w-28px rd-999px flex items-center justify-center flex-shrink-0 text-t-tertiary hover:text-[rgb(var(--danger-6))] hover:bg-[rgba(var(--danger-6),0.12)] active:bg-[rgba(var(--danger-6),0.18)] transition-colors' onClick={onClearDir} aria-label={t('conversation.welcome.clearWorkspace')} style={{ border: '1px solid var(--border-base)' }}>
              <IconClose strokeWidth={3} style={{ fontSize: 15 }} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

export default GuidInputCard;
