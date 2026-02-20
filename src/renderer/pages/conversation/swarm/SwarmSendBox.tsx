/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AcpSendBox from '../acp/AcpSendBox';

/**
 * SwarmSendBox - Thin wrapper around AcpSendBox
 * Swarm conversations use ACP backend internally (SwarmSessionManager spawns ACP agents)
 * so we can reuse all ACP sendbox functionality directly.
 */
const SwarmSendBox: React.FC<{
  conversation_id: string;
}> = ({ conversation_id }) => {
  // Swarm uses claude backend by default (can be configured in swarm.config.json)
  // Pass 'claude' as backend since swarm agents are ACP-based
  return <AcpSendBox conversation_id={conversation_id} backend='claude' />;
};

export default SwarmSendBox;
