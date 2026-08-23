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
 * input/output. ACP titles are natural-language descriptions that can equal
 * the summary — render the summary only when it adds information. */
const GenericToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => {
  const summary = block.summary && block.summary !== block.title ? block.summary : block.fileName;
  return (
    <ToolBlockShell category='generic' status={block.status} title={block.title} summary={summary}>
      <ToolBlockDetail block={block} outputError={block.status === 'error'} />
    </ToolBlockShell>
  );
};

export default GenericToolBlock;
