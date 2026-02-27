/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAgentChat } from './AgentChatContext';
import styles from './agentchat.module.css';

const AgentStatusBar: React.FC = () => {
  const { agents } = useAgentChat();

  return (
    <div className={styles.statusBar}>
      {agents.map((agent) => (
        <div key={agent.id} className={styles.statusPill} data-status={agent.status} title={`${agent.label}: ${agent.status}`}>
          <span className={styles.statusDot} data-status={agent.status} />
          <span style={{ color: agent.color }}>{agent.label}</span>
        </div>
      ))}
    </div>
  );
};

export default AgentStatusBar;
