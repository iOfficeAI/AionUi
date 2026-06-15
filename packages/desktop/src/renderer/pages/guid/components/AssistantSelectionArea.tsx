/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import styles from '../index.module.css';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { Down, Robot, Search } from '@icon-park/react';
import { Button, Dropdown, Input } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useTranslation } from 'react-i18next';

type AssistantSelectionAreaProps = {
  selectedAssistantId?: string | null;
  assistants: Assistant[];
  localeKey: string;
  onSelectAssistant: (assistantId: string) => void;
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  selectedAssistantId,
  assistants,
  localeKey,
  onSelectAssistant,
}) => {
  const { t } = useTranslation();
  const [moreVisible, setMoreVisible] = useState(false);
  const [search, setSearch] = useState('');

  const enabledAssistants = [...assistants]
    .filter((assistant) => assistant.enabled !== false)
    .sort((left, right) => left.sort_order - right.sort_order);
  const visibleAssistants = enabledAssistants.slice(0, 4);
  const hasOverflow = enabledAssistants.length > visibleAssistants.length;
  const selectedId = selectedAssistantId || undefined;
  const filteredOverflowAssistants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return enabledAssistants;
    return enabledAssistants.filter((assistant) => {
      const label = assistant.name_i18n?.[localeKey] || assistant.name;
      return label.toLowerCase().includes(query);
    });
  }, [enabledAssistants, localeKey, search]);

  if (enabledAssistants.length === 0) return null;

  const renderAssistantPill = (assistant: Assistant, testId: string) => {
    const avatarValue = assistant.avatar?.trim();
    const mappedAvatar = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
    const resolvedAvatar = avatarValue ? resolveExtensionAssetUrl(avatarValue) : undefined;
    const avatarImage = mappedAvatar || resolvedAvatar;
    const isImageAvatar = Boolean(
      avatarImage &&
        (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) || /^(https?:|file:\/\/|data:|\/)/i.test(avatarImage))
    );
    const isSelected = selectedId === assistant.id;
    const label = assistant.name_i18n?.[localeKey] || assistant.name;

    return (
      <Button
        key={assistant.id}
        data-testid={testId}
        type='text'
        className={`!inline-flex !h-auto !items-center !gap-6px !rounded-999px !border-none !px-12px !py-8px !text-13px transition-all ${
          isSelected ? 'font-600 text-t-primary shadow-sm' : 'text-t-secondary opacity-75 hover:opacity-100'
        }`}
        style={isSelected ? { background: 'var(--bg-base, #fff)' } : { background: 'transparent' }}
        onClick={() => {
          onSelectAssistant(`custom:${assistant.id}`);
          setMoreVisible(false);
        }}
      >
        <span className='inline-flex h-20px w-20px items-center justify-center overflow-hidden rounded-999px bg-fill-2'>
          {isImageAvatar ? (
            <img src={avatarImage} alt='' className='h-full w-full object-contain' />
          ) : avatarValue ? (
            <span className={styles.assistantCardEmoji}>{avatarValue}</span>
          ) : (
            <Robot theme='outline' size={14} />
          )}
        </span>
        <span className='whitespace-nowrap'>{label}</span>
      </Button>
    );
  };

  const overflowDroplist = (
    <div className='min-w-240px rounded-12px border border-border-2 bg-bg-base p-8px shadow-lg'>
      <div className='mb-8px'>
        <Input
          size='small'
          value={search}
          onChange={setSearch}
          prefix={<Search theme='outline' size={14} />}
          placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search assistants...' })}
        />
      </div>
      <div className='flex max-h-260px flex-col gap-4px overflow-y-auto'>
        {filteredOverflowAssistants.map((assistant) => (
          <div key={assistant.id}>{renderAssistantPill(assistant, `assistant-overflow-${assistant.id}`)}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div className='mt-18px mb-16px w-full'>
      <div className='w-full overflow-x-auto'>
        <div
          className='inline-flex min-w-full items-center gap-6px rounded-999px px-6px py-6px'
          style={{ background: 'var(--color-guid-agent-bar, var(--aou-2))' }}
        >
          {visibleAssistants.map((assistant) => renderAssistantPill(assistant, `preset-pill-${assistant.id}`))}
          {hasOverflow ? (
            <Dropdown
              trigger='click'
              position='bl'
              droplist={overflowDroplist}
              popupVisible={moreVisible}
              onVisibleChange={setMoreVisible}
            >
              <Button
                data-testid='assistant-more-btn'
                type='text'
                className='!inline-flex !h-34px !items-center !gap-4px !rounded-999px !border-none !px-12px !py-8px !text-13px !text-t-secondary opacity-75 transition-opacity hover:opacity-100'
              >
                <span>{t('common.more', { defaultValue: 'More' })}</span>
                <Down theme='outline' size={14} />
              </Button>
            </Dropdown>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AssistantSelectionArea;
