/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import React from 'react';

/** Icon-only mini control — shared by GitChangeList and Sider file-tree toolbar. */
export const WorkspaceToolbarActionBtn: React.FC<{
  tooltip: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}> = ({ tooltip, icon, onClick, disabled }) => (
  <Tooltip mini content={tooltip}>
    <Button
      size='mini'
      type='text'
      disabled={disabled}
      className='workspace-toolbar-icon-btn !p-2px !h-24px !w-24px !text-t-secondary hover:!text-brand'
      icon={icon}
      onClick={onClick}
    />
  </Tooltip>
);