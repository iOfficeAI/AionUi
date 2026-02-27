/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAgentChat } from './AgentChatContext';
import styles from './agentchat.module.css';

const TypingIndicator: React.FC = () => {
  const { typingAgent, getAgentColor } = useAgentChat();

  if (!typingAgent) return null;

  return (
    <div className={styles.typingIndicator}>
      <span className={styles.typingName} style={{ color: getAgentColor(typingAgent) }}>
        {typingAgent}
      </span>{' '}
      is thinking...
    </div>
  );
};

export default TypingIndicator;
