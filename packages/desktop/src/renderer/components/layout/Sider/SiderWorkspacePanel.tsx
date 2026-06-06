/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace panel for the Sider in conversations mode.
 *
 * Splits the Sider body vertically into a top file-tree scaffold and a
 * bottom diff scaffold with a draggable resize handle the operator can
 * drag top-to-bottom to adjust each section's size. This is
 * framework/visual scaffolding only — no data wiring, no fs access, no
 * IPC, no real file-tree or diff content.
 *
 * The handle renders an always-visible grip bar so the divider is
 * discoverable at rest (the shared `terminal-resize-handle*` classes
 * used by the terminal/nav/editor handles are transparent at rest, so
 * we deliberately do not use them here). The 50/50 default split is
 * persisted via `autoSaveId`.
 */

import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import SiderFileTree from './SiderFileTree';
import SiderDiffSection from './SiderDiffSection';

interface SiderWorkspacePanelProps {
  collapsed?: boolean;
}

const SiderWorkspacePanel: React.FC<SiderWorkspacePanelProps> = ({ collapsed }) => {
  if (collapsed) {
    return null;
  }

  return (
    <PanelGroup
      direction='vertical'
      autoSaveId='sider-workspace-split'
      className='size-full min-h-0'
      data-testid='sider-workspace-panel'
    >
      <Panel defaultSize={50} minSize={15} className='min-h-0'>
        <SiderFileTree />
      </Panel>
      <PanelResizeHandle
        className='group relative h-8px shrink-0 flex items-center justify-center cursor-row-resize'
        aria-label='Resize file tree and diff sections'
        aria-orientation='vertical'
      >
        <span
          aria-hidden='true'
          className='h-3px w-32px rounded-full bg-[var(--color-border-2)] transition-colors group-hover:bg-[var(--brand)] group-data-[resize-handle-state=drag]:bg-[var(--brand)]'
        />
      </PanelResizeHandle>
      <Panel defaultSize={50} minSize={15} className='min-h-0'>
        <SiderDiffSection />
      </Panel>
    </PanelGroup>
  );
};

export default SiderWorkspacePanel;
