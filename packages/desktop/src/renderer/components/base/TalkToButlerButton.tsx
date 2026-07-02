/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback } from 'react';

export type TalkToButlerExtraAction = {
  key: string;
  label: string;
  onClick: () => void;
};

export type TalkToButlerButtonProps = {
  /**
   * Button label in its plain, action-neutral form — e.g. "Create assistant",
   * "Add model". Clicking the button opens the menu; it does NOT run any action
   * itself (we don't bias the user toward chat or manual).
   */
  label: string;
  /** Prompt pre-filled into the home chat input for the "via chat" item. */
  prompt?: string;
  /** Optional file paths pre-attached to the input (e.g. report screenshots). */
  files?: string[];
  /**
   * Override for the "via chat" action. Default behaviour hands off to the
   * AionUi Butler (select it + pre-fill `prompt`). Callers that want a
   * different chat target — e.g. the scheduled-tasks page, which creates with
   * the user's last-used assistant — pass their own handler here.
   */
  onChat?: () => void;
  /** Menu label for the "via chat" item, e.g. "Create via chat". */
  chatLabel: string;
  /** The original manual action and its menu label. */
  onManual?: () => void;
  manualLabel?: string;
  /** Extra menu actions inserted before the manual item (e.g. MCP imports). */
  extraActions?: TalkToButlerExtraAction[];
  type?: 'primary' | 'outline' | 'secondary' | 'default';
  size?: 'mini' | 'small' | 'default' | 'large';
  className?: string;
  'data-testid'?: string;
};

const CHAT_KEY = '__chat__';
const MANUAL_KEY = '__manual__';

/**
 * Unified "create/add" entry point used across settings. The button itself is
 * action-neutral: clicking it only opens a dropdown menu where the user picks
 * "… via chat" (hand off to the AionUi Butler with a pre-filled prompt), the
 * manual action, and/or extra actions. We intentionally do NOT run a default
 * action on the button, so no path is recommended over another. One component,
 * one style, everywhere (the scheduled-tasks page uses it too).
 */
const TalkToButlerButton: React.FC<TalkToButlerButtonProps> = ({
  label,
  prompt,
  files,
  onChat,
  chatLabel,
  onManual,
  manualLabel,
  extraActions,
  type = 'primary',
  size = 'small',
  className,
  ['data-testid']: testId,
}) => {
  const talkToButler = useTalkToButler();

  const handleSelect = useCallback(
    (key: string) => {
      if (key === CHAT_KEY) {
        if (onChat) onChat();
        else void talkToButler({ prompt: prompt ?? '', files });
      } else if (key === MANUAL_KEY) {
        onManual?.();
      } else {
        extraActions?.find((action) => action.key === key)?.onClick();
      }
    },
    [onChat, talkToButler, prompt, files, onManual, extraActions]
  );

  const droplist = (
    <Menu onClickMenuItem={handleSelect}>
      <Menu.Item key={CHAT_KEY} data-testid={testId ? `${testId}-chat` : undefined}>
        {chatLabel}
      </Menu.Item>
      {extraActions?.map((action) => (
        <Menu.Item key={action.key} data-testid={testId ? `${testId}-${action.key}` : undefined}>
          {action.label}
        </Menu.Item>
      ))}
      {onManual && manualLabel ? (
        <Menu.Item key={MANUAL_KEY} data-testid={testId ? `${testId}-manual` : undefined}>
          {manualLabel}
        </Menu.Item>
      ) : null}
    </Menu>
  );

  return (
    <Dropdown trigger='click' droplist={droplist} position='br'>
      <Button
        type={type}
        size={size}
        className={classNames('!h-32px !rounded-8px !px-14px', className)}
        data-testid={testId}
      >
        <span className='flex items-center gap-6px'>
          {label}
          <Down theme='outline' size={14} fill='currentColor' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default TalkToButlerButton;
