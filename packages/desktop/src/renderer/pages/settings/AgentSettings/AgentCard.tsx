/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Delete, EditTwo, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { resolveAgentLogo, useAgentLogos } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import {
  type AgentManagementStatus,
  type ManagedAgent,
  formatManagedAgentDiagnosticMessage,
} from '@/renderer/utils/model/agentTypes';
import AgentRepairPanel from './AgentRepairPanel';

type AgentCardProps =
  | {
      type: 'official';
      agent: ManagedAgent;
      onTestConnection: () => void;
      isTesting?: boolean;
    }
  | {
      type: 'custom';
      agent: ManagedAgent;
      onTestConnection: () => void;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
      isTesting?: boolean;
    };

const statusColor = (status?: AgentManagementStatus): 'green' | 'orange' | 'red' | 'gold' | 'gray' => {
  switch (status) {
    case 'available':
      return 'green';
    case 'unavailable':
      return 'orange';
    case 'missing':
      return 'red';
    case 'needs_auth':
      return 'gold';
    default:
      return 'gray';
  }
};

const statusLabelKey = (status?: AgentManagementStatus) => {
  switch (status) {
    case 'available':
      return 'settings.agentManagement.statusAvailable';
    case 'unavailable':
      return 'settings.agentManagement.statusUnavailable';
    case 'missing':
      return 'settings.agentManagement.statusMissing';
    case 'needs_auth':
      return 'settings.agentManagement.statusNeedsAuth';
    default:
      return 'settings.agentManagement.statusUnknown';
  }
};

const formatStatusTimestamp = (timestamp?: number): string | null => {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString();
};

const diagnosticMeta = (backend?: string, agentType?: string) => {
  const parts = [backend, agentType].filter(Boolean).map((value) => value!.toUpperCase());
  return parts.join(' · ');
};

const statusSummary = (
  t: (key: string, options?: Record<string, unknown>) => string,
  agent: ManagedAgent,
  diagnostics: string
) => {
  if (diagnostics) return diagnostics;
  switch (agent.status) {
    case 'available':
      return t('settings.agentManagement.testConnectionAvailable', { name: agent.name });
    case 'missing':
      return t('settings.agentManagement.testConnectionMissing', { name: agent.name });
    case 'unavailable':
      return t('settings.agentManagement.testConnectionUnavailable', { name: agent.name });
    case 'needs_auth':
      return t('settings.agentManagement.needsAuthSummary', { name: agent.name });
    default:
      return t('settings.agentManagement.statusUnknown');
  }
};

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();
  const logos = useAgentLogos();

  if (props.type === 'official') {
    const { agent, onTestConnection, isTesting } = props;
    const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
    const logo =
      extensionAvatar ||
      resolveAgentLogo(logos, {
        icon: agent.icon,
        backend: agent.backend || agent.agent_type,
        custom_agent_id: agent.custom_agent_id,
        isExtension: agent.isExtension,
      });

    const metadata = diagnosticMeta(agent.backend, agent.agent_type);
    const diagnostics = formatManagedAgentDiagnosticMessage(t, agent);
    const summary = statusSummary(t, agent, diagnostics);
    const checkedAt = formatStatusTimestamp(agent.last_check_at);

    return (
      <div className='flex min-h-[154px] flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-12px transition-colors hover:border-[var(--color-border-3)]'>
        <div className='mb-10px flex justify-center'>
          <Avatar size={40} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
            {logo ? <img src={logo} alt={agent.name} className='h-full w-full object-contain' /> : '🤖'}
          </Avatar>
        </div>

        <div className='mb-10px flex-1 text-center'>
          <Typography.Text className='block text-13px font-medium leading-18px line-clamp-2'>
            {agent.name}
          </Typography.Text>
          {metadata ? (
            <Typography.Text className='mt-4px block text-11px text-t-secondary'>{metadata}</Typography.Text>
          ) : null}
          <div className='mt-6px flex items-center justify-center gap-6px'>
            <Tag size='small' color={statusColor(agent.status)}>
              {t(statusLabelKey(agent.status))}
            </Tag>
            {diagnostics && (
              <Tooltip content={diagnostics}>
                <Typography.Text className='text-11px text-t-secondary'>i</Typography.Text>
              </Tooltip>
            )}
          </div>
          <Typography.Paragraph className='mt-6px mb-0 text-11px leading-16px text-t-secondary'>
            {summary}
          </Typography.Paragraph>
          {checkedAt ? (
            <Typography.Text className='mt-4px block text-11px text-t-secondary'>
              {`${t('settings.mcpCheckedAtLabel')} ${checkedAt}`}
            </Typography.Text>
          ) : null}
        </div>

        <Button size='small' type='secondary' onClick={onTestConnection} loading={isTesting}>
          {t('settings.agentManagement.testConnection')}
        </Button>

        {/* Repair Panel for non-available statuses */}
        {agent.status !== 'available' && <AgentRepairPanel agent={agent} onSaved={onTestConnection} />}
      </div>
    );
  }

  const { agent, onTestConnection, onEdit, onDelete, onToggle, isTesting } = props;
  const isDisabled = agent.enabled === false;
  const metadata = diagnosticMeta(agent.backend, agent.agent_type);
  const diagnostics = formatManagedAgentDiagnosticMessage(t, agent);
  const summary = statusSummary(t, agent, diagnostics);
  const checkedAt = formatStatusTimestamp(agent.last_check_at);

  return (
    <div className='flex flex-col px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
      <div className='flex items-center justify-between'>
        <div className={`flex items-center gap-12px min-w-0 flex-1 ${isDisabled ? 'opacity-50' : ''}`}>
          <Avatar
            size={32}
            shape='square'
            style={{ flexShrink: 0, backgroundColor: agent.icon ? 'var(--color-fill-2)' : 'transparent', fontSize: 18 }}
          >
            {agent.icon || <Robot theme='outline' size='20' />}
          </Avatar>
          <div className='min-w-0 flex-1'>
            <Typography.Text className='font-medium text-14px'>{agent.name || 'Custom Agent'}</Typography.Text>
            {metadata ? <div className='text-11px text-t-secondary truncate'>{metadata}</div> : null}
            <div className='text-12px text-t-secondary truncate'>
              {agent.command}
              {agent.args && agent.args.length > 0 ? ` ${agent.args.join(' ')}` : ''}
            </div>
            <div className='mt-6px flex items-center gap-6px'>
              <Tag size='small' color={statusColor(agent.status)}>
                {t(statusLabelKey(agent.status))}
              </Tag>
              {diagnostics && (
                <Tooltip content={diagnostics}>
                  <Typography.Text className='text-11px text-t-secondary'>i</Typography.Text>
                </Tooltip>
              )}
            </div>
            <div className='mt-4px text-11px text-t-secondary line-clamp-2'>{summary}</div>
            {checkedAt ? (
              <div className='mt-4px text-11px text-t-secondary'>{`${t('settings.mcpCheckedAtLabel')} ${checkedAt}`}</div>
            ) : null}
          </div>
        </div>
        <div className='flex items-center gap-8px'>
          <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
          <Button size='small' type='text' onClick={onTestConnection} loading={isTesting}>
            {t('settings.agentManagement.testConnection')}
          </Button>
          <Button size='small' type='text' icon={<EditTwo theme='outline' size='14' />} onClick={onEdit} />
          <Button
            size='small'
            type='text'
            status='danger'
            icon={<Delete theme='outline' size='14' />}
            onClick={onDelete}
          />
        </div>
      </div>

      {/* Repair Panel for non-available statuses */}
      {agent.status !== 'available' && <AgentRepairPanel agent={agent} onSaved={onTestConnection} />}
    </div>
  );
};

export default AgentCard;
