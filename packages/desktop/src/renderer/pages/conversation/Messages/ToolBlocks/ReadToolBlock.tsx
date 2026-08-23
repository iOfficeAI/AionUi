/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import ToolBlockDetail from './ToolBlockDetail';
import ToolBlockShell from './ToolBlockShell';

/** Read block: file name + optional line range in the header, output below. */
const ReadToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <ToolBlockShell
    category='read'
    status={block.status}
    summary={[block.fileName, block.lineRange].filter(Boolean).join(' ')}
  >
    <ToolBlockDetail block={block} showInput={false} />
  </ToolBlockShell>
);

export default ReadToolBlock;
