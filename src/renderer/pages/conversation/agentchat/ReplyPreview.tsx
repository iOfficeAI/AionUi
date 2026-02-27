/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAgentChat } from './AgentChatContext';
import styles from './agentchat.module.css';

const ReplyPreview: React.FC = () => {
  const { replyTo, setReplyTo, getAgentColor } = useAgentChat();

  if (!replyTo) return null;

  return (
    <div className={styles.replyPreview}>
      <span className={styles.replyPreviewLabel}>Reply</span>
      <span style={{ color: getAgentColor(replyTo.sender), fontWeight: 600 }}>{replyTo.sender}:</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyTo.text}</span>
      <button type='button' className={styles.replyCancel} onClick={() => setReplyTo(null)} title='Cancel reply'>
        &times;
      </button>
    </div>
  );
};

export default ReplyPreview;
