/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/** Delay before the helper tooltip appears (ms). */
const ADD_TO_CHAT_TOOLTIP_DELAY_MS = 650;

type WorkspaceTreeAddToChatButtonProps = {
  onClick: (event: React.MouseEvent) => void;
};

export const WorkspaceTreeAddToChatButton: React.FC<WorkspaceTreeAddToChatButtonProps> = ({ onClick }) => {
  const { t } = useTranslation();
  const label = t('conversation.workspace.contextMenu.addToChat');
  const tooltip = t('conversation.workspace.contextMenu.addFileToChatTooltip');

  return (
    <Tooltip mini position='top' content={tooltip} triggerProps={{ mouseEnterDelay: ADD_TO_CHAT_TOOLTIP_DELAY_MS }}>
      <button type='button' className='workspace-tree-add-to-chat' aria-label={label} onClick={onClick}>
        <Plus theme='outline' size={12} strokeWidth={2} fill='currentColor' />
      </button>
    </Tooltip>
  );
};
