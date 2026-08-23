/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Checklist, Edit, FileCode, Search, SettingTwo, Terminal, Toolkit } from '@icon-park/react';
import type { ToolCategory } from '@/common/chat/toolBlockConstants';

const ICONS: Record<ToolCategory, React.ComponentType<{ theme?: string; size?: number | string }>> = {
  edit: Edit,
  bash: Terminal,
  read: FileCode,
  search: Search,
  task: SettingTwo,
  todo: Checklist,
  generic: Toolkit,
};

/** Colored-square category icon rendered inside the tool block header. */
const CategoryIcon: React.FC<{ category: ToolCategory; small?: boolean }> = ({ category, small }) => {
  const Icon = ICONS[category] ?? Toolkit;
  return (
    <span className={`tool-block__icon tool-block__icon--${category}${small ? ' tool-block__icon--sm' : ''}`}>
      <Icon theme='outline' size={small ? 10 : 12} />
    </span>
  );
};

export default CategoryIcon;
