/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Card, Radio, Tag, Typography } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useMemo, useState } from 'react';
import type { WorkspaceApproval } from '../hooks/useWorkspaceApprovals';

const { Text } = Typography;

type ApprovalsListProps = {
  t: TFunction;
  approvals: WorkspaceApproval[];
  respond: (approval: WorkspaceApproval, value: string, params?: Record<string, string>) => Promise<void>;
};

const actionIcons: Record<string, string> = {
  exec: '⚡',
  edit: '✏️',
  info: '📖',
  mcp: '🔌',
};

/** A single pending approval card with option selection + confirm. */
const ApprovalCard: React.FC<{
  t: TFunction;
  approval: WorkspaceApproval;
  respond: ApprovalsListProps['respond'];
}> = ({ t, approval, respond }) => {
  const { options = [], description, title, action, command_type, parent_session_id } = approval;

  // Default to the safest "once" option so a quick confirm never silences the
  // whole session via "always".
  const defaultSelected = useMemo(() => {
    const once = options.find((opt) => String(opt.value).toLowerCase().includes('once'));
    return once ? String(once.value) : null;
  }, [options]);

  const [selected, setSelected] = useState<string | null>(defaultSelected);
  const [isResponding, setIsResponding] = useState(false);

  const icon = actionIcons[action || ''] || '🔐';
  const displayTitle = title || description || t('messages.permissionRequest');

  // Surface an explicit path for external_directory prompts so rapid bursts
  // are distinguishable.
  const targetPath = useMemo<string | undefined>(() => {
    for (const opt of options) {
      if (opt?.value !== 'allow_dir') continue;
      const p = (opt as { params?: Record<string, string> })?.params?.path;
      if (typeof p === 'string' && p.startsWith('/')) return p;
    }
    return undefined;
  }, [options]);

  const handleConfirm = async () => {
    if (isResponding || !selected) return;
    setIsResponding(true);
    try {
      const chosen = options.find((opt) => String(opt.value) === selected);
      await respond(approval, selected, chosen?.params ?? undefined);
    } catch (error) {
      console.error('[ApprovalsList] Failed to respond to approval:', error);
      setIsResponding(false);
    }
  };

  return (
    <Card className='mb-8px' size='small' bordered>
      <div className='flex items-center gap-6px mb-6px flex-wrap'>
        {parent_session_id && (
          <Tag color='arcoblue' size='small'>
            {t('messages.remoteSubagent.tag')}
          </Tag>
        )}
        <span className='text-16px'>{icon}</span>
        <Text className='text-13px font-medium text-t-primary break-words'>{displayTitle}</Text>
      </div>

      {targetPath && (
        <code className='block text-11px bg-1 p-6px rounded mb-6px text-t-primary break-all'>{targetPath}</code>
      )}
      {command_type && command_type !== 'external_directory' && (
        <code className='block text-11px bg-1 p-6px rounded mb-6px text-t-primary break-all'>{command_type}</code>
      )}
      {description && description !== displayTitle && description !== targetPath && (
        <Text className='block text-11px text-t-secondary mb-6px'>{description}</Text>
      )}

      <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected} className='mb-6px'>
        {options.length > 0 ? (
          options.map((option, index) => (
            <Radio key={String(option.value) || `opt_${index}`} value={String(option.value)}>
              {t(option.label, { ...option.params, defaultValue: option.label })}
            </Radio>
          ))
        ) : (
          <Text type='secondary'>{t('messages.noOptionsAvailable')}</Text>
        )}
      </Radio.Group>

      <Button type='primary' size='mini' disabled={!selected || isResponding} onClick={handleConfirm}>
        {isResponding ? t('messages.processing') : t('messages.confirm')}
      </Button>
    </Card>
  );
};

/** The Approvals workspace tab body: a scrollable list of pending approvals. */
const ApprovalsList: React.FC<ApprovalsListProps> = ({ t, approvals, respond }) => {
  if (approvals.length === 0) {
    return (
      <div className='flex items-center justify-center h-full text-t-tertiary text-12px px-16px text-center'>
        {t('conversation.workspace.approvals.empty')}
      </div>
    );
  }

  return (
    <div className='h-full overflow-y-auto px-12px py-8px'>
      {approvals.map((approval) => (
        <ApprovalCard key={approval.call_id} t={t} approval={approval} respond={respond} />
      ))}
    </div>
  );
};

export default ApprovalsList;
