/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';

import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import WindowControls from '../WindowControls';
import MobileConversationBrand from './MobileConversationBrand';
import './titlebar.css';

type DetachedTitlebarProps = {
  conversationId: string;
};

/** Minimal draggable chrome for a detached conversation. */
const DetachedTitlebar: React.FC<DetachedTitlebarProps> = ({ conversationId }) => {
  const isDesktopRuntime = isElectronDesktop();
  const isMacRuntime = isDesktopRuntime && isMacOS();

  return (
    <div
      data-detached-titlebar
      className={classNames(
        'app-titlebar bg-2 border-b border-[var(--border-base)]',
        isDesktopRuntime && 'app-titlebar--desktop',
        isMacRuntime && 'app-titlebar--mac !ps-76px'
      )}
    >
      <div className='app-titlebar__brand !justify-start !text-left min-w-0 px-8px'>
        <MobileConversationBrand conversation_id={conversationId} fallbackTitle='AionUi' />
      </div>
      {isDesktopRuntime && !isMacRuntime && (
        <div className='app-titlebar__toolbar'>
          <WindowControls />
        </div>
      )}
    </div>
  );
};

export default DetachedTitlebar;
