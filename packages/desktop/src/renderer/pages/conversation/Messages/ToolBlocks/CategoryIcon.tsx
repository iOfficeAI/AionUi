/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Checklist, Edit, PreviewOpen, Search, Terminal, Tool, Toolkit } from '@icon-park/react';
import type { ToolCategory } from '@/common/chat/toolBlockConstants';

const ICONS: Record<ToolCategory, React.ComponentType<{ theme?: string; size?: number | string }>> = {
  edit: Edit,
  bash: Terminal,
  read: PreviewOpen,
  search: Search,
  task: Tool,
  todo: Checklist,
  generic: Toolkit,
};

/** Monochrome outline category icon rendered in the tool block header. */
const CategoryIcon: React.FC<{ category: ToolCategory; small?: boolean }> = ({ category, small }) => {
  const Icon = ICONS[category] ?? Toolkit;
  return <Icon className='tool-block__icon' theme='outline' size={small ? 12 : 14} />;
};

export default CategoryIcon;
