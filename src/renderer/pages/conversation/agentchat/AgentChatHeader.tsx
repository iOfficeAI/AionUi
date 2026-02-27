/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, InputNumber, Tooltip } from '@arco-design/web-react';
import { CheckSmall, ListCheckbox, Setting } from '@icon-park/react';
import React, { useState } from 'react';
import { useAgentChat } from './AgentChatContext';
import AgentStatusBar from './AgentStatusBar';
import styles from './agentchat.module.css';

const AgentChatHeader: React.FC = () => {
  const { todoPanelOpen, setTodoPanelOpen, username, setUsername, maxHops, setMaxHops, todos } = useAgentChat();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openTodoCount = todos.filter((t) => t.status === 'todo').length;

  return (
    <>
      <div className='flex items-center gap-8px'>
        <AgentStatusBar />
        <div className='flex-1' />
        <Tooltip content='Todos'>
          <Button size='mini' type='text' icon={<ListCheckbox theme='outline' size='16' />} onClick={() => setTodoPanelOpen(!todoPanelOpen)} className='relative'>
            {openTodoCount > 0 && <span className='absolute -top-1 -right-1 bg-[#f87171] text-white text-10px rounded-full min-w-14px h-14px flex items-center justify-center px-2px'>{openTodoCount}</span>}
          </Button>
        </Tooltip>
        <Tooltip content='Settings'>
          <Button size='mini' type='text' icon={<Setting theme='outline' size='16' />} onClick={() => setSettingsOpen(!settingsOpen)} />
        </Tooltip>
      </div>

      {settingsOpen && (
        <div className={styles.settingsPanel}>
          <div className='flex items-center gap-8px'>
            <label className='text-12px text-[var(--color-text-3)] whitespace-nowrap'>Name</label>
            <Input size='mini' value={username} onChange={setUsername} maxLength={20} style={{ width: 120 }} />
          </div>
          <div className='flex items-center gap-8px'>
            <label className='text-12px text-[var(--color-text-3)] whitespace-nowrap'>Loop guard</label>
            <InputNumber size='mini' value={maxHops} onChange={(v) => setMaxHops(v || 4)} min={1} max={50} style={{ width: 70 }} />
          </div>
          <Button size='mini' type='primary' icon={<CheckSmall theme='outline' size='14' />} onClick={() => setSettingsOpen(false)}>
            Save
          </Button>
        </div>
      )}
    </>
  );
};

export default AgentChatHeader;
