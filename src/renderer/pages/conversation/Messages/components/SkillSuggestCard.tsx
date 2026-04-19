/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Message } from '@arco-design/web-react';
import { Down, Lightning, Up } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownView from '@renderer/components/Markdown';
import type { SkillSuggestion } from '@renderer/utils/chat/skillSuggestParser';

interface SkillSuggestCardProps {
  suggestion: SkillSuggestion;
  cronJobId: string;
}

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };

const SkillSuggestCard: React.FC<SkillSuggestCardProps> = ({ suggestion, cronJobId }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Check if skill already exists on mount (persists across navigation)
  useEffect(() => {
    ipcBridge.cron.hasSkill
      .invoke({ jobId: cronJobId })
      .then((exists) => {
        if (exists) setSaved(true);
      })
      .catch(() => {});
  }, [cronJobId]);

  if (dismissed || saved) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipcBridge.cron.saveSkill.invoke({ jobId: cronJobId, content: suggestion.content });
      setSaved(true);
      Message.success(t('cron.skill.saveSuccess'));
    } catch (err) {
      Message.error(t('cron.skill.saveFailed'));
      console.error('[SkillSuggestCard] Failed to save skill:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className='mt-8px p-12px rd-8px bg-fill-0 b-1 b-solid'
      style={{ borderColor: 'color-mix(in srgb, var(--color-border-2) 70%, transparent)' }}
    >
      <div className='flex items-center gap-6px mb-8px'>
        <Lightning theme='filled' size={16} fill={iconColors.warning} />
        <span className='font-500 text-14px'>{t('cron.skill.turnIntoSkill')}</span>
      </div>
      <div className='text-t-primary text-13px mb-4px'>{suggestion.name}</div>
      <div className='text-t-secondary text-12px mb-8px'>{suggestion.description}</div>

      {/* Expandable preview */}
      <div
        className='flex items-center gap-4px text-12px text-t-secondary cursor-pointer hover:text-t-primary mb-8px select-none'
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <Up size={12} /> : <Down size={12} />}
        <span>{t('cron.skill.preview')}</span>
      </div>
      {expanded && (
        <div className='mb-12px p-8px rd-4px bg-bg-3 max-h-240px overflow-y-auto text-12px'>
          <MarkdownView codeStyle={CODE_STYLE}>{`\`\`\`markdown\n${suggestion.content}\n\`\`\``}</MarkdownView>
        </div>
      )}

      <div className='flex gap-8px'>
        <Button type='primary' size='small' loading={saving} onClick={handleSave}>
          {t('cron.skill.save')}
        </Button>
        <Button size='small' onClick={() => setDismissed(true)}>
          {t('cron.skill.dismiss')}
        </Button>
      </div>
    </div>
  );
};

export default SkillSuggestCard;
