/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { ArrowLeft } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import AgentRepairPanel from './AgentRepairPanel';

const AgentRepairPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { agents, isRefreshing, refreshCatalog } = useManagedAgents();

  const agent = agents.find((a) => a.id === id);

  useEffect(() => {
    if (!isRefreshing && !agent) {
      navigate('/settings/agent', { replace: true });
    }
  }, [isRefreshing, agent, navigate]);

  if (isRefreshing || !agent) {
    return null;
  }

  const handleBack = () => {
    navigate('/settings/agent');
  };

  const handleSaved = () => {
    void refreshCatalog();
  };

  return (
    <div data-testid='agent-repair-page' className='flex h-full min-h-0 flex-col overflow-hidden bg-transparent'>
      <div
        data-testid='agent-repair-bar'
        className='sticky top-0 z-10 flex h-48px flex-shrink-0 items-center gap-12px border-b border-border-2 bg-bg-0 px-18px'
      >
        <div className='flex min-w-0 items-center gap-10px'>
          <Button
            type='text'
            icon={<ArrowLeft size={16} />}
            onClick={handleBack}
            data-testid='btn-back-agent-repair'
            className='!rounded-8px !px-6px !text-t-primary'
          >
            {t('common.goBack', { defaultValue: 'Back' })}
          </Button>
          <div className='truncate text-14px font-600 text-t-primary'>{agent.name}</div>
        </div>
      </div>

      <div data-testid='agent-repair-body' className='relative min-h-0 flex-1 overflow-auto px-18px py-18px pb-24px'>
        <div className='mx-auto w-full max-w-760px'>
          <AgentRepairPanel agent={agent} onSaved={handleSaved} />
        </div>
      </div>
    </div>
  );
};

export default AgentRepairPage;
