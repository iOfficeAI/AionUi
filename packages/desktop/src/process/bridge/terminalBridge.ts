/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@/common/platform/bridge';
import {
  terminalService,
  type TerminalCreateOptions,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type TerminalKillOptions,
  type TerminalResizeOptions,
  type TerminalSessionInfo,
  type TerminalWriteOptions,
} from '../services/terminal';

export function initTerminalBridge(): void {
  const terminalDataEmitter = bridge.buildEmitter<TerminalDataEvent>('terminal:data');
  const terminalExitEmitter = bridge.buildEmitter<TerminalExitEvent>('terminal:exit');

  terminalService.setCallbacks({
    onData: (event) => {
      terminalDataEmitter.emit(event);
    },
    onExit: (event) => {
      terminalExitEmitter.emit(event);
    },
  });

  bridge.buildProvider<TerminalSessionInfo, TerminalCreateOptions>('terminal:create').provider((options) => {
    return terminalService.createSession(options);
  });

  bridge.buildProvider<void, TerminalWriteOptions>('terminal:write').provider((options) => {
    terminalService.write(options.id, options.data);
  });

  bridge.buildProvider<void, TerminalResizeOptions>('terminal:resize').provider((options) => {
    terminalService.resize(options.id, options.cols, options.rows);
  });

  bridge.buildProvider<void, TerminalKillOptions>('terminal:kill').provider((options) => {
    terminalService.kill(options.id);
  });
}
