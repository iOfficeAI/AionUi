/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ipcBridge } from '@/common';
import { Link, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import AgentCard from './AgentCard';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Detected agents (filter out custom and remote)
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data.filter((agent) => agent.backend !== 'custom' && agent.backend !== 'remote');
    }
    return [];
  });

  // Gemini CLI first among detected agents
  const geminiAgent = detectedAgents?.find((a) => a.backend === 'gemini');
  const otherDetected = detectedAgents?.filter((a) => a.backend !== 'gemini') ?? [];

  return (
    <div className='flex flex-col gap-8px py-16px'>
      {/* Top action bar */}
      <div className='flex items-center justify-between px-16px'>
        <span className='text-12px text-t-secondary'>
          {t('settings.agentManagement.localAgentsDescription')}
          {'  '}
          <Link href='https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup' target='_blank' className='text-12px'>
            {t('settings.agentManagement.localAgentsSetupLink')}
          </Link>
        </span>
      </div>

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.detected')}
        </Typography.Text>
      </div>
      <div className='flex flex-col gap-4px px-0'>
        {geminiAgent && (
          <AgentCard
            type='detected'
            agent={geminiAgent}
            settingsDisabled={false}
            onSettings={() => navigate('/settings/gemini')}
          />
        )}
        {otherDetected.map((agent) => (
          <AgentCard key={agent.backend} type='detected' agent={agent} />
        ))}
        {(!detectedAgents || detectedAgents.length === 0) && (
          <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
            {t('settings.agentManagement.localAgentsEmpty')}
          </Typography.Text>
        )}
      </div>
    </div>
  );
};

export default LocalAgents;
