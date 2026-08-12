/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import { Avatar, Button, Input } from '@arco-design/web-react';
import type { BuiltinIconOption } from '../types';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FieldLabel, SectionCard } from './editorSectionPrimitives';

type IdentitySectionProps = {
  isIdentityLocked: boolean;
  isDescriptionReadOnly: boolean;
  editIcon: string;
  editName: string;
  setEditName: (value: string) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  setEditIcon: (value: string) => void;
  setEditIconPreview: (value: string | undefined) => void;
  onPickIconImage: () => void;
  renderIconPreview: () => React.ReactNode;
  builtinIconOptions: BuiltinIconOption[];
  readOnlyLabel: string;
};

const IdentitySection: React.FC<IdentitySectionProps> = ({
  isIdentityLocked,
  isDescriptionReadOnly,
  editIcon,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  setEditIcon,
  setEditIconPreview,
  onPickIconImage,
  renderIconPreview,
  builtinIconOptions,
  readOnlyLabel,
}) => {
  const { t } = useTranslation();
  const isIdentityEditable = !isIdentityLocked;
  const isDescriptionEditable = !isDescriptionReadOnly;

  return (
    <SectionCard
      title={t('settings.knowledgeBaseIdentitySection', { defaultValue: 'Identity' })}
      legend={{
        label: t('settings.knowledgeBaseEffectiveImmediately', { defaultValue: 'Applies immediately' }),
        tone: 'now',
      }}
      readOnly={isIdentityLocked && isDescriptionReadOnly}
      readOnlyLabel={readOnlyLabel}
      testId='kb-card-identity'
    >
      <div className='flex items-start gap-14px'>
        {!isIdentityEditable ? (
          <Avatar shape='square' size={42} className='!rounded-10px bg-fill-1'>
            {renderIconPreview()}
          </Avatar>
        ) : (
          <div className='flex flex-col items-center gap-8px'>
            <EmojiPicker
              value={editIcon}
              builtinAvatars={builtinIconOptions}
              onChange={(emoji) => {
                setEditIconPreview(undefined);
                setEditIcon(emoji);
              }}
              placement='br'
            >
              <Button
                type='text'
                data-testid='btn-kb-icon-emoji'
                className='!h-42px !w-42px !rounded-10px !bg-fill-1 !p-0'
              >
                <Avatar shape='square' size={42} className='!rounded-10px bg-fill-1'>
                  {renderIconPreview()}
                </Avatar>
              </Button>
            </EmojiPicker>
            <Button
              type='outline'
              size='mini'
              data-testid='btn-kb-icon-upload'
              className='!rounded-8px !border-border-2 !bg-base !px-8px !text-11px'
              onClick={onPickIconImage}
            >
              {t('settings.knowledgeBaseIconUploadImage', { defaultValue: 'Upload image' })}
            </Button>
          </div>
        )}
        <div className='min-w-0 flex-1 space-y-10px'>
          <div className='flex items-center gap-12px'>
            <FieldLabel required>{t('settings.knowledgeBaseName', { defaultValue: 'Name' })}</FieldLabel>
            <Input
              value={editName}
              onChange={(value) => setEditName(value)}
              disabled={!isIdentityEditable}
              placeholder={t('settings.knowledgeBaseNamePlaceholder', {
                defaultValue: 'Enter a name for this knowledge base',
              })}
              data-testid='input-kb-name'
              className='rounded-8px border-border-2 bg-bg-0'
            />
          </div>
          <div className='flex items-center gap-12px'>
            <FieldLabel>{t('settings.knowledgeBaseDescription', { defaultValue: 'Description' })}</FieldLabel>
            <Input
              value={editDescription}
              onChange={(value) => setEditDescription(value)}
              disabled={!isDescriptionEditable}
              data-testid='input-kb-desc'
              placeholder={t('settings.knowledgeBaseDescriptionPlaceholder', {
                defaultValue: 'What is this knowledge base about?',
              })}
              className='rounded-8px border-border-2 bg-bg-0'
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

export default IdentitySection;
