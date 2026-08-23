/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Checklist,
  Delete,
  Edit,
  FileCodeOne,
  Folder,
  Globe,
  Pencil,
  Search,
  Terminal,
  Tool,
  Toolkit,
} from '@icon-park/react';
import type { ToolCategory } from '@/common/chat/toolBlockConstants';
import type { ToolIconKey } from '@/common/chat/toolBlockPresentation';

const ICONS: Record<ToolIconKey, React.ComponentType<{ theme?: string; size?: number | string }>> = {
  read: FileCodeOne,
  edit: Edit,
  write: Pencil,
  bash: Terminal,
  search: Search,
  glob: Folder,
  task: Tool,
  web: Globe,
  delete: Delete,
  plan: Checklist,
  generic: Toolkit,
};

const CATEGORY_FALLBACK: Record<ToolCategory, ToolIconKey> = {
  edit: 'edit',
  bash: 'bash',
  read: 'read',
  search: 'search',
  task: 'task',
  todo: 'plan',
  generic: 'generic',
};

/** Monochrome outline tool icon. `iconKey` selects the per-tool icon
 * (getToolIconKey); without it the category default applies. */
const CategoryIcon: React.FC<{ category: ToolCategory; iconKey?: ToolIconKey; small?: boolean }> = ({
  category,
  iconKey,
  small,
}) => {
  const Icon = ICONS[iconKey ?? CATEGORY_FALLBACK[category]] ?? Toolkit;
  return <Icon className='tool-block__icon' theme='outline' size={small ? 12 : 16} />;
};

export default CategoryIcon;
