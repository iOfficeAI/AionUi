/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { getToolTitleKey } from '@/common/chat/toolBlockConstants';
import { classifyBashCommand, getToolIconKey, prettifyToolName } from '@/common/chat/toolBlockPresentation';
import ToolBlockDetail from './ToolBlockDetail';
import ToolBlockShell from './ToolBlockShell';

/** Fallback for every tool name we do not special-case. Header title follows
 * the reference design: known names show a translated action title, command
 * tools are classified by what the command does (read/list/search), and
 * unknown names are prettified (snake_case/CamelCase -> spaced words).
 * ACP titles are natural-language descriptions that can equal the summary —
 * render the summary only when it adds information. */
const GenericToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => {
  const nameKey = getToolTitleKey(block.title);
  const commandKind = !nameKey && block.command ? classifyBashCommand(block.command).kind : 'run';
  const commandKey =
    commandKind === 'read'
      ? 'messages.toolBlocks.readTitle'
      : commandKind === 'list'
        ? 'messages.toolBlocks.listFilesTitle'
        : commandKind === 'search'
          ? 'messages.toolBlocks.searchTitle'
          : undefined;
  const titleKey = nameKey ?? commandKey;
  const summary = block.summary && block.summary !== block.title ? block.summary : block.fileName;
  return (
    <ToolBlockShell
      category='generic'
      status={block.status}
      iconKey={getToolIconKey(block.title, block.command)}
      titleKey={titleKey}
      title={titleKey ? undefined : prettifyToolName(block.title)}
      summary={summary}
    >
      <ToolBlockDetail block={block} outputError={block.status === 'error'} />
    </ToolBlockShell>
  );
};

export default GenericToolBlock;
