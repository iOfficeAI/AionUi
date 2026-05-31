/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  COMMAND_PALETTE_OPEN_EVENT,
  dispatchChatOpenConversationSearchEvent,
} from '@/renderer/utils/chat/chatShortcutEvents';
import { dispatchTeamCreateEvent } from '@/renderer/utils/team/teamShortcutEvents';
import { Button } from '@arco-design/web-react';
import { Calendar, Plus, Search, UserToUserTransmission } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type ChatCommand = {
  key: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
};

const ChatCommandPanel: React.FC = () => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo<ChatCommand[]>(
    () => [
      {
        key: 'new-session',
        label: '新会话',
        icon: <Plus theme='outline' size='16' />,
        run: () => void navigate('/guid'),
      },
      {
        key: 'search',
        label: '搜索',
        icon: <Search theme='outline' size='16' />,
        run: dispatchChatOpenConversationSearchEvent,
      },
      {
        key: 'scheduled-tasks',
        label: '定时任务',
        icon: <Calendar theme='outline' size='16' />,
        run: () => void navigate('/scheduled'),
      },
      {
        key: 'new-team',
        label: '新建团队',
        icon: <UserToUserTransmission theme='outline' size='16' />,
        run: dispatchTeamCreateEvent,
      },
      {
        key: 'new-chat',
        label: '新建聊天',
        icon: <Plus theme='outline' size='16' />,
        run: () => void navigate('/guid', { state: { resetAssistant: true } }),
      },
    ],
    [navigate]
  );

  const closePanel = useCallback(() => {
    setOpen(false);
    setActiveIndex(0);
  }, []);

  const executeCommand = useCallback(
    (index: number) => {
      const command = commands[index];
      if (!command) return;
      closePanel();
      command.run();
    },
    [closePanel, commands]
  );

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      setActiveIndex(0);
    };
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, handleOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
    };
  }, [closePanel, open]);

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-[1000] pointer-events-none'>
      <div
        ref={panelRef}
        role='menu'
        tabIndex={-1}
        className='pointer-events-auto absolute left-1/2 top-72px w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-8px border border-solid border-border-2 bg-bg-2 shadow-[0_16px_48px_rgba(0,0,0,0.18)] p-6px outline-none'
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closePanel();
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'Tab') {
            event.preventDefault();
            setActiveIndex((previous) => (previous + 1) % commands.length);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((previous) => (previous - 1 + commands.length) % commands.length);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            executeCommand(activeIndex);
          }
        }}
        autoFocus
      >
        {commands.map((command, index) => (
          <Button
            key={command.key}
            role='menuitem'
            type='text'
            className={classNames('!w-full !justify-start !h-36px !px-10px !rounded-6px', {
              '!bg-fill-3': index === activeIndex,
            })}
            icon={command.icon}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => executeCommand(index)}
          >
            <span className='text-14px'>{command.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};

export default ChatCommandPanel;
