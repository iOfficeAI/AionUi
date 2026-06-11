/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BgProcesses — drop-in header slot for remote OpenCode conversations.
 *
 * Renders the compact indicator pill when at least one background
 * process is running, and lazily mounts the drawer on click. Both share
 * a single `useBgProcesses` subscription so the header pill and the
 * drawer are always looking at the same process snapshot.
 *
 * The component is designed to be mounted in any place that has access
 * to a `remoteAgentId`; in production it sits in
 * `ChatConversation.tsx`'s header badge row, alongside
 * `RemoteSessionBadge` / `RemoteServerBadge` etc. For non-remote
 * conversations it is mounted with `remoteAgentId={null}` and renders
 * nothing.
 */

import type { BgProcessUiInfo } from '@/common/types/agent/bgProcessTypes';
import React, { useState } from 'react';
import { useBgProcesses } from '../../hooks/useBgProcesses';
import BgProcessIndicator from './BgProcessIndicator';
import BgProcessPanel from './BgProcessPanel';

export type BgProcessesProps = {
  /** Null when the conversation is not a remote OpenCode session. */
  remoteAgentId: string | null | undefined;
};

const BgProcesses: React.FC<BgProcessesProps> = ({ remoteAgentId }) => {
  const [open, setOpen] = useState(false);
  // We want the indicator to reflect the live "is anything running"
  // answer even when the panel is closed, so the hook is always
  // subscribed (just with the panel poll gated on `open`).
  const { running } = useBgProcesses(remoteAgentId, { pollWhileOpen: open });

  if (!remoteAgentId) return null;

  return (
    <>
      <BgProcessIndicator running={running} onOpen={() => setOpen(true)} />
      {open ? <BgProcessPanel remoteAgentId={remoteAgentId} open={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
};

export type { BgProcessUiInfo };
export default BgProcesses;
