/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { parseError } from '@/common/utils';
import { revalidateAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Message, Popconfirm, Tooltip } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Header button for ACP conversations that restarts the agent runtime: the
 * backend tears down the cached CLI agent process (cancelling any active
 * turn) and respawns it, resuming the session when possible. Chat history is
 * preserved. Use after external CLI config changes — e.g. switching the
 * Codex channel via ccswitch — which a running process cannot pick up.
 *
 * In team mode pass `team`; the restart then goes through the team runtime
 * endpoint (the standalone endpoint rejects team-owned conversations).
 */
const AcpRuntimeRestartButton: React.FC<{
  conversation_id: string;
  /** Team context for team member conversations. */
  team?: { team_id: string; slot_id: string };
  disabled?: boolean;
  disabledReason?: string;
}> = ({ conversation_id, team, disabled, disabledReason }) => {
  const { t } = useTranslation();
  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      if (team) {
        await ipcBridge.team.restartAgentRuntime.invoke({ team_id: team.team_id, slot_id: team.slot_id });
      } else {
        await ipcBridge.conversation.restartRuntime.invoke({ conversation_id });
      }
      // The runtime was rebuilt; pull the fresh config options so the model
      // selector reflects the new process (channel/model) immediately.
      await revalidateAcpConfigOptions(conversation_id);
      Message.success(t('agent.runtimeRestart.success'));
    } catch (error) {
      if (isBackendHttpError(error) && error.code === 'TEAM_MEMBER_BUSY') {
        Message.error(t('agent.runtimeRestart.busy'));
      } else {
        Message.error(parseError(error) || t('agent.runtimeRestart.failed'));
      }
    } finally {
      setRestarting(false);
    }
  }, [conversation_id, team, restarting, t]);

  const button = (
    <Button
      type='text'
      size='mini'
      className='h-28px w-28px'
      loading={restarting}
      disabled={disabled}
      icon={<Refresh theme='outline' size='14' fill={iconColors.secondary} />}
      aria-label={t('agent.runtimeRestart.tooltip')}
    />
  );

  if (disabled) {
    return <Tooltip content={disabledReason ?? t('agent.runtimeRestart.tooltip')}>{button}</Tooltip>;
  }

  return (
    <Popconfirm
      title={t('agent.runtimeRestart.tooltip')}
      content={t('agent.runtimeRestart.confirmContent')}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      onOk={() => void handleRestart()}
    >
      <span className='inline-flex'>
        <Tooltip content={t('agent.runtimeRestart.tooltip')}>{button}</Tooltip>
      </span>
    </Popconfirm>
  );
};

export default AcpRuntimeRestartButton;
