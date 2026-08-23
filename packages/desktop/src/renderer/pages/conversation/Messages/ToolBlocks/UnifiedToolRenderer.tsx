/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ToolMessage, UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { normalizeUnifiedToolBlocks } from '@/common/chat/unifiedToolBlock';
import BashToolBlock from './BashToolBlock';
import EditToolBlock from './EditToolBlock';
import GenericToolBlock from './GenericToolBlock';
import ReadToolBlock from './ReadToolBlock';
import TaskToolBlock from './TaskToolBlock';
import TodoToolBlock from './TodoToolBlock';

/** Renders ONE tool message (any of the three types) via the unified pipeline. */
const UnifiedToolRenderer: React.FC<{ message: ToolMessage; steps?: UnifiedToolBlock[] }> = ({ message, steps = [] }) => {
  const blocks = normalizeUnifiedToolBlocks([message]);
  if (blocks.length === 0) return null;
  const block = blocks[0];
  switch (block.category) {
    case 'edit':
      return <EditToolBlock block={block} />;
    case 'bash':
      return <BashToolBlock block={block} />;
    case 'read':
      return <ReadToolBlock block={block} />;
    case 'task':
      return <TaskToolBlock block={block} steps={steps} />;
    case 'todo':
      return <TodoToolBlock block={block} />;
    default:
      return <GenericToolBlock block={block} />;
  }
};

export default UnifiedToolRenderer;
