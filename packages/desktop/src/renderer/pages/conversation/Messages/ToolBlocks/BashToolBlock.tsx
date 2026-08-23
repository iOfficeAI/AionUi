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

/** Bash block: human description (or command) in the header; full command
 * line and output below, output in red on error. */
const BashToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <ToolBlockShell
    category='bash'
    status={block.status}
    title={block.title}
    summary={truncate(block.summary ?? block.command, 60)}
  >
    {block.command && <div className='tool-block__mono tool-block__command'>{block.command}</div>}
    <ToolBlockDetail block={block} showInput={false} outputError={block.status === 'error'} />
  </ToolBlockShell>
);

export default BashToolBlock;
