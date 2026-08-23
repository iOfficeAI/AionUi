/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import ToolBlockDetail from './ToolBlockDetail';
import ToolBlockShell from './ToolBlockShell';

/** Fallback for every tool name we do not special-case. The raw tool name is
 * the header title (the user's only identity cue), the body shows the full
 * input/output. */
const GenericToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <ToolBlockShell
    category='generic'
    status={block.status}
    title={block.title}
    summary={block.summary ?? block.fileName}
  >
    <ToolBlockDetail block={block} outputError={block.status === 'error'} />
  </ToolBlockShell>
);

export default GenericToolBlock;
