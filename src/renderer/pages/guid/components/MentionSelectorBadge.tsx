/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dropdown } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React from 'react';

type MentionSelectorBadgeProps = {
  visible: boolean;
  open: boolean;
  onOpenChange: (visible: boolean) => void;
  agentLabel: string;
  mentionMenu: React.ReactNode;
  onResetQuery: () => void;
};

const MentionSelectorBadge: React.FC<MentionSelectorBadgeProps> = ({ visible, open, onOpenChange, agentLabel, mentionMenu, onResetQuery }) => {
  if (!visible) return null;

  return (
    <div className='flex items-center gap-8px mb-8px'>
      <Dropdown
        trigger='click'
        popupVisible={open}
        onVisibleChange={(v) => {
          onOpenChange(v);
          if (v) {
            onResetQuery();
          }
        }}
        droplist={mentionMenu}
      >
        <div className='flex items-center gap-6px bg-fill-2 px-10px py-4px rd-16px cursor-pointer select-none'>
          <span className='text-14px font-medium text-t-primary'>@{agentLabel}</span>
          <Down theme='outline' size={12} />
        </div>
      </Dropdown>
    </div>
  );
};

export default MentionSelectorBadge;
