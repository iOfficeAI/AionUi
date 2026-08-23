/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import ToolBlockDetail from './ToolBlockDetail';
import ToolBlockShell from './ToolBlockShell';

/** Fallback for every tool name we do not special-case. Always renders:
 * the raw tool name is the summary (the user's only identity cue), the body
 * shows the full input/output. */
const GenericToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <ToolBlockShell category='generic' status={block.status} summary={block.summary ?? block.title ?? block.fileName}>
    <span className='tool-block__title tool-block__mono'>{block.title}</span>
    <ToolBlockDetail block={block} outputError={block.status === 'error'} />
  </ToolBlockShell>
);

export default GenericToolBlock;
