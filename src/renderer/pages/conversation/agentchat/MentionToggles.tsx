/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAgentChat } from './AgentChatContext';
import styles from './agentchat.module.css';

const MentionToggles: React.FC = () => {
  const { agents, activeMentions, toggleMention } = useAgentChat();

  if (!agents.length) return null;

  return (
    <div className={styles.mentionToggles}>
      {agents.map((agent) => (
        <button
          key={agent.id}
          type='button'
          className={styles.mentionToggle}
          data-active={activeMentions.has(agent.id) ? 'true' : 'false'}
          style={{ '--agent-color': agent.color } as React.CSSProperties}
          onClick={() => toggleMention(agent.id)}
          title={`Toggle @${agent.name}`}
        >
          @{agent.name}
        </button>
      ))}
    </div>
  );
};

export default MentionToggles;
