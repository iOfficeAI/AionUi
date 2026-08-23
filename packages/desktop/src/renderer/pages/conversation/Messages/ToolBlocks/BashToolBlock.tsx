/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { truncate } from '@/common/chat/toolBlockPresentation';
import ToolBlockDetail from './ToolBlockDetail';
import ToolBlockShell from './ToolBlockShell';

/** Bash block: command line in a monospace pill; output below, in red on error. */
const BashToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <ToolBlockShell category='bash' status={block.status} summary={truncate(block.command ?? block.summary, 60)}>
    <div className='tool-block__mono tool-block__command'>{block.command}</div>
    <ToolBlockDetail block={block} showInput={false} outputError={block.status === 'error'} />
  </ToolBlockShell>
);

export default BashToolBlock;
