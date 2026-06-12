import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import { Avatar, Button, Input } from '@arco-design/web-react';
import type { BuiltinAvatarOption } from '../types';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FieldLabel, SectionCard } from './editorSectionPrimitives';

type IdentitySectionProps = {
  isBuiltin: boolean;
  editAvatar: string;
  editName: string;
  setEditName: (value: string) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  setEditAvatar: (value: string) => void;
  setEditAvatarPreview: (value: string | undefined) => void;
  onPickAvatarImage: () => void;
  renderAvatarPreview: () => React.ReactNode;
  builtinAvatarOptions: BuiltinAvatarOption[];
  readOnlyLabel: string;
};

const IdentitySection: React.FC<IdentitySectionProps> = ({
  isBuiltin,
  editAvatar,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  setEditAvatar,
  setEditAvatarPreview,
  onPickAvatarImage,
  renderAvatarPreview,
  builtinAvatarOptions,
  readOnlyLabel,
}) => {
  const { t } = useTranslation();
  const isProfileEditable = !isBuiltin;

  return (
    <SectionCard
      title={t('settings.assistantIdentitySection', { defaultValue: 'Identity' })}
      legend={{
        label: t('settings.assistantEffectiveImmediately', { defaultValue: 'Applies immediately' }),
        tone: 'now',
      }}
      readOnly={isBuiltin}
      readOnlyLabel={readOnlyLabel}
      testId='assistant-card-identity'
    >
      <div className='flex items-start gap-14px'>
        {!isProfileEditable ? (
          <Avatar shape='square' size={42} className='!rounded-10px bg-fill-1'>
            {renderAvatarPreview()}
          </Avatar>
        ) : (
          <div className='flex flex-col items-center gap-8px'>
            <EmojiPicker
              value={editAvatar}
              builtinAvatars={builtinAvatarOptions}
              onChange={(emoji) => {
                setEditAvatarPreview(undefined);
                setEditAvatar(emoji);
              }}
              placement='br'
            >
              <Button
                type='text'
                data-testid='btn-assistant-avatar-emoji'
                className='!h-42px !w-42px !rounded-10px !bg-fill-1 !p-0'
              >
                <Avatar shape='square' size={42} className='!rounded-10px bg-fill-1'>
                  {renderAvatarPreview()}
                </Avatar>
              </Button>
            </EmojiPicker>
            <Button
              type='outline'
              size='mini'
              data-testid='btn-assistant-avatar-upload'
              className='!rounded-8px !border-border-2 !bg-base !px-8px !text-11px'
              onClick={onPickAvatarImage}
            >
              {t('settings.assistantAvatarUploadImage', { defaultValue: 'Upload image' })}
            </Button>
          </div>
        )}
        <div className='min-w-0 flex-1 space-y-10px'>
          <div className='flex items-center gap-12px'>
            <FieldLabel required>{t('settings.assistantName', { defaultValue: 'Name' })}</FieldLabel>
            <Input
              value={editName}
              onChange={(value) => setEditName(value)}
              disabled={!isProfileEditable}
              placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })}
              data-testid='input-assistant-name'
              className='rounded-8px border-border-2 bg-bg-0'
            />
          </div>
          <div className='flex items-center gap-12px'>
            <FieldLabel>{t('settings.assistantDescription', { defaultValue: 'Description' })}</FieldLabel>
            <Input
              value={editDescription}
              onChange={(value) => setEditDescription(value)}
              disabled={!isProfileEditable}
              data-testid='input-assistant-desc'
              placeholder={t('settings.assistantDescriptionPlaceholder', {
                defaultValue: 'What can this assistant help with?',
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
