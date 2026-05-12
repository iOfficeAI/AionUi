/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FilePreview from '@/renderer/components/media/FilePreview';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { Input } from '@arco-design/web-react';
import React from 'react';
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
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;

  // Mention state
  mentionOpen: boolean;
  mentionSelectorBadge: React.ReactNode;
  mentionDropdown: React.ReactNode;

  // Files
  files: string[];
  onRemoveFile: (path: string) => void;

  // Action row
  actionRow: React.ReactNode;
};

const GuidInputCard: React.FC<GuidInputCardProps> = ({
  input,
  onInputChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  placeholder,
  isInputActive,
  isFileDragging,
  activeBorderColor,
  inactiveBorderColor,
  activeShadow,
  dragHandlers,
  mentionOpen,
  mentionSelectorBadge,
  mentionDropdown,
  files,
  onRemoveFile,
  actionRow,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { compositionHandlers, isComposing } = useCompositionInput();
  const textareaAutoSize = isMobile ? { minRows: 2, maxRows: 8 } : { minRows: 3, maxRows: 20 };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return;
    onKeyDown(e);
  };

  return (
    <div
      className={`${styles.guidInputCard} guid-input-card-shell relative p-16px border-3 b bg-dialog-fill-0 b-solid rd-20px flex flex-col ${mentionOpen ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 ${isFileDragging ? 'border-dashed guid-input-card-shell--dragging' : ''}`}
      style={{
        zIndex: 1,
        transition: 'box-shadow 0.25s ease, border-color 0.25s ease, border-width 0.25s ease',
        width: isMobile ? 'calc(100% + 28px)' : undefined,
        marginLeft: isMobile ? -14 : undefined,
        marginRight: isMobile ? -14 : undefined,
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
      <Input.TextArea
        autoSize={textareaAutoSize}
        placeholder={placeholder}
        spellCheck={false}
        className={`text-16px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !p-0 ${styles.lightPlaceholder}`}
        value={input}
        onChange={onInputChange}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        {...compositionHandlers}
        onKeyDown={handleKeyDown}
        data-testid='guid-input'
      />
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
      <UploadProgressBar source='sendbox' />
      {actionRow}
    </div>
  );
};

export default GuidInputCard;
