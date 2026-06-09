/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace panel for the Sider in conversations mode.
 *
 * Stacks four VS Code-style collapsible sections in a single column:
 *   1. Explorer  (file tree)
 *   2. Diff      (uncommitted changes)
 *   3. Outline   (active buffer symbol list)
 *   4. Timeline  (active buffer file history)
 *
 * Each section is a `SiderAccordionSection` — the explorer and diff
 * panes wrap their existing implementations in `headerless` mode so
 * the accordion's header is the single source of chrome. Outline and
 * Timeline are new lightweight sections that read `useEditorContext`
 * directly so re-renders stay scoped to the affected section (typing
 * in the editor only re-renders Outline + Timeline, never the file
 * tree or diff).
 *
 * Expand/collapse state persists to `localStorage` per section so
 * the user's preferred layout survives reloads. Default expansions
 * match VS Code: explorer + diff open, outline + timeline collapsed.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import SiderFileTree from './SiderFileTree';
import SiderDiffSection from './SiderDiffSection';
import SiderAccordionSection from './sections/SiderAccordionSection';
import SiderOutlineSection from './sections/SiderOutlineSection';
import SiderTimelineSection from './sections/SiderTimelineSection';

type SiderWorkspacePanelProps = {
  collapsed?: boolean;
};

const SiderWorkspacePanel: React.FC<SiderWorkspacePanelProps> = ({ collapsed }) => {
  const { t } = useTranslation();

  if (collapsed) {
    return null;
  }

  return (
    <div className='size-full min-h-0 flex flex-col bg-[var(--bg-2)]' data-testid='sider-workspace-panel'>
      <SiderAccordionSection
        title={t('conversation.sider.explorer')}
        defaultExpanded
        storageKey='sider.section.explorer'
        data-testid='sider-accordion-explorer'
      >
        <SiderFileTree headerless />
      </SiderAccordionSection>

      <SiderAccordionSection
        title={t('conversation.workspace.changes.diff')}
        defaultExpanded
        storageKey='sider.section.diff'
        data-testid='sider-accordion-diff'
      >
        <SiderDiffSection headerless />
      </SiderAccordionSection>

      <SiderAccordionSection
        title={t('conversation.sider.outline')}
        defaultExpanded={false}
        storageKey='sider.section.outline'
        data-testid='sider-accordion-outline'
      >
        <SiderOutlineSection />
      </SiderAccordionSection>

      <SiderAccordionSection
        title={t('conversation.sider.timeline')}
        defaultExpanded={false}
        storageKey='sider.section.timeline'
        data-testid='sider-accordion-timeline'
      >
        <SiderTimelineSection />
      </SiderAccordionSection>
    </div>
  );
};

export default SiderWorkspacePanel;
