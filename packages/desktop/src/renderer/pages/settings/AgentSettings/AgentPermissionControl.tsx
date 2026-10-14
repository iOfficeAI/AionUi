/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Message, Select, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import {
  AGENT_PERMISSION_LEVEL_OPTIONS,
  type AgentPermissionPolicy,
  isPermissionPolicyActionable,
} from '@/renderer/utils/model/agentPermissionPolicy';

const UNMANAGED = '__unmanaged__';

interface AgentPermissionControlProps {
  /** Read-model for this agent's permission policy. */
  policy: AgentPermissionPolicy | undefined;
  /** Called after a write-through succeeds so the parent can refresh the read-model. */
  onChanged: () => void;
}

/**
 * Write-through permission-level selector for an external agent (OpenCode pilot).
 *
 * Renders nothing when the backend reports the agent is unsupported or not
 * installed. `onChanged` lets the parent re-poll the policy so the echoed
 * `current_level` stays in sync with the agent's config file.
 */
export const AgentPermissionControl: React.FC<AgentPermissionControlProps> = ({ policy, onChanged }) => {
  const { t } = useTranslation();

  if (!isPermissionPolicyActionable(policy)) {
    return null;
  }

  const apply = async (level: string) => {
    const agent = policy.agent;
    try {
      if (level === UNMANAGED) {
        await ipcBridge.permissionPolicy.clear.invoke({ agent });
        Message.success(t('settings.agentManagement.permissionCleared'));
      } else {
        await ipcBridge.permissionPolicy.setLevel.invoke({ agent, level: level as 'ask' | 'auto_edit' | 'full_auto' });
        Message.success(t('settings.agentManagement.permissionSaved'));
      }
      onChanged();
    } catch {
      Message.error(t('settings.agentManagement.permissionSaveFailed'));
    }
  };

  const current = policy.current_level ?? UNMANAGED;

  return (
    <div data-testid='agent-permission-control' className='flex items-center gap-8px'>
      <Typography.Text className='text-12px text-t-secondary'>
        {t('settings.agentManagement.permissionPolicyLabel')}
      </Typography.Text>
      <Select
        data-testid='agent-permission-select'
        size='small'
        value={current}
        onChange={apply}
        className='!w-140px'
        options={[
          { value: UNMANAGED, label: t('settings.agentManagement.permissionNotSet') },
          ...AGENT_PERMISSION_LEVEL_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
          })),
        ]}
      />
    </div>
  );
};

export default AgentPermissionControl;
