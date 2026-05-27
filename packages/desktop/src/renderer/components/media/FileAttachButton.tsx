/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button, Message, Trigger } from '@arco-design/web-react';
import { FolderOpen, Lightning, Paperclip, Plus, Right } from '@icon-park/react';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { FileService } from '@/renderer/services/FileService';
import type { FileMetadata } from '@/renderer/services/FileService';
import { emitter } from '@/renderer/utils/emitter';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

interface FileAttachButtonProps {
  openFileSelector: () => void;
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  loadedSkills?: string[];
}

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  suffix?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}> = ({ icon, label, suffix, onClick, className = '' }) => (
  <div
    className={`flex items-center gap-10px px-12px py-9px rounded-8px cursor-pointer hover:bg-fill-2 transition-colors text-14px text-t-primary select-none ${className}`}
    onClick={onClick}
  >
    <span className='flex-shrink-0 inline-flex items-center justify-center color-#86909c w-18px leading-none'>
      {icon}
    </span>
    <span className='flex-1 leading-none'>{label}</span>
    {suffix}
  </div>
);

const FileAttachButton: React.FC<FileAttachButtonProps> = ({ openFileSelector, onLocalFilesAdded, loadedSkills }) => {
  const conversationContext = useConversationContextSafe();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const skillNames = loadedSkills ?? conversationContext?.loadedSkills ?? [];
  const { data: skillIndex } = useSWR(skillNames.length > 0 ? 'skills-index' : null, () =>
    ipcBridge.fs.listAvailableSkills.invoke()
  );
  const descriptionByName = new Map((skillIndex ?? []).map((s) => [s.name, s.description]));

  const handleSkillClick = useCallback((name: string) => {
    setOpen(false);
    emitter.emit('sendbox.fill', `/${name} `);
  }, []);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversation_id);
        if (processed.length > 0) onLocalFilesAdded(processed);
      } catch {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      e.target.value = '';
    },
    [conversationContext?.conversation_id, onLocalFilesAdded, t]
  );

  const isDesktop = isElectronDesktop();
  const hasSkills = skillNames.length > 0;
  const plusIcon = <Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />;

  if (isDesktop && !hasSkills) {
    return (
      <Button
        type='secondary'
        shape='circle'
        icon={plusIcon}
        onClick={openFileSelector}
        data-testid='aionrs-attach-folder-btn'
      />
    );
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-bg-2, #fff)',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
    border: '1px solid var(--color-border-1, #e5e6eb)',
    padding: '6px 0',
    minWidth: 220,
    zIndex: 1050,
  };

  const skillsPanel = (
    <div style={{ ...cardStyle, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
      {skillNames.map((name) => (
        <MenuItem
          key={name}
          icon={<Lightning theme='outline' size={15} strokeWidth={2.5} />}
          label={name}
          onClick={() => handleSkillClick(name)}
          className='mx-6px'
        />
      ))}
    </div>
  );

  const menu = (
    <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
      {/* Skills 最不常用，在最上（离 + 最远） */}
      {hasSkills && (
        <>
          <div className='px-6px'>
            <Trigger
              popup={() => skillsPanel}
              trigger='hover'
              position='right'
              popupVisible={skillsOpen}
              onVisibleChange={setSkillsOpen}
              mouseEnterDelay={100}
              mouseLeaveDelay={150}
            >
              <div>
                <MenuItem
                  icon={<Lightning theme='outline' size={15} strokeWidth={2.5} />}
                  label={`${t('conversation.skills.loaded', { defaultValue: 'Loaded Skills' })} · ${skillNames.length}`}
                  suffix={<Right theme='outline' size={12} strokeWidth={3} style={{ color: 'var(--text-disabled)' }} />}
                />
              </div>
            </Trigger>
          </div>
          <div style={{ margin: '4px 12px', height: 1, backgroundColor: 'var(--color-border-1, #e5e6eb)' }} />
        </>
      )}

      {/* 文件操作最常用，在最下（离 + 最近） */}
      <div className='px-6px'>
        {!isDesktop && (
          <MenuItem
            icon={<FolderOpen theme='outline' size={15} strokeWidth={2.5} />}
            label={t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' })}
            onClick={() => {
              fileInputRef.current?.click();
              setOpen(false);
            }}
          />
        )}
        <MenuItem
          icon={<Paperclip theme='outline' size={15} strokeWidth={2.5} />}
          label={t('common.fileAttach.hostFiles', { defaultValue: 'Add files or photos' })}
          onClick={() => {
            openFileSelector();
            setOpen(false);
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      <Trigger
        popup={() => menu}
        trigger='click'
        position='tl'
        popupVisible={open}
        onVisibleChange={setOpen}
        clickToClose
        popupAlign={{ bottom: 8 }}
      >
        <Button
          type='secondary'
          shape='circle'
          icon={plusIcon}
          loading={uploading}
          disabled={uploading}
          data-testid='aionrs-attach-folder-btn'
        />
      </Trigger>
      <input
        ref={fileInputRef}
        type='file'
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalFileChange}
        data-testid='aionrs-file-upload-input'
      />
    </>
  );
};

export default FileAttachButton;
