/**
 * @license
 * Copyright 2026 Solid Solutions
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import AgentStatusBadge from '@/renderer/components/agent/AgentStatusBadge';
import TaskProgressBar from '@/renderer/components/agent/TaskProgressBar';
import QuickAgentSwitcher from '@/renderer/components/agent/QuickAgentSwitcher';
import styles from './solidai.module.css';

type Agent = {
  id: string;
  name: string;
};

const mockAgents: Agent[] = [
  { id: 'solidai-agriculture', name: 'Agriculture Agent' },
  { id: 'solidai-health', name: 'Health Agent' },
  { id: 'solidai-education', name: 'Education Agent' },
];

const SolidAiPage: React.FC = () => {
  const { t } = useTranslation();
  const [selectedAgent, setSelectedAgent] = React.useState('solidai-agriculture');

  return (
    <div className={`p-6 space-y-6 ${styles.container}`}>
      <h1 className="text-2xl font-bold">{t('solidai:title')}</h1>
      <p className="text-gray-600">{t('solidai:description')}</p>

      <div className={`space-y-4 ${styles.section}`}>
        <h2 className="text-xl">{t('solidai:agentStatus')}</h2>
        <div className="flex gap-4">
          <AgentStatusBadge status="online" agentName="Agriculture Agent" />
          <AgentStatusBadge status="busy" agentName="Health Agent" />
          <AgentStatusBadge status="offline" agentName="Education Agent" />
        </div>
      </div>

      <div className={`space-y-4 ${styles.section}`}>
        <h2 className="text-xl">{t('solidai:taskProgress')}</h2>
        <TaskProgressBar taskName="Processing farm data" progress={65} status="active" />
        <TaskProgressBar taskName="Generating health report" progress={100} status="completed" />
      </div>

      <div className={`space-y-4 ${styles.section}`}>
        <h2 className="text-xl">{t('solidai:switchAgent')}</h2>
        <QuickAgentSwitcher
          agents={mockAgents}
          selectedAgentId={selectedAgent}
          onSelect={setSelectedAgent}
        />
      </div>
    </div>
  );
};

export default SolidAiPage;
