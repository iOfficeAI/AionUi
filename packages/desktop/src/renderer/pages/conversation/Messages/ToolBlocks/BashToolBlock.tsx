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

/** Bash block: human description in the header (matching the reference design,
 * where the command line lives only in the body); full command and output
 * below, output in red on error. Agents whose tool schema has no description
 * param (codex, aionrs) fall back to a truncated command in the header. */
const BashToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <ToolBlockShell category='bash' status={block.status} summary={truncate(block.summary ?? block.command, 60)}>
    {block.command && <div className='tool-block__mono tool-block__command'>{block.command}</div>}
    <ToolBlockDetail block={block} showInput={false} outputError={block.status === 'error'} />
  </ToolBlockShell>
);

export default BashToolBlock;
