/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import type { ToolCategory } from '@/common/chat/toolBlockConstants';
import { TOOL_BLOCK_META } from '@/common/chat/toolBlockConstants';
import type { UnifiedToolStatus } from '@/common/chat/unifiedToolBlock';
import CategoryIcon from './CategoryIcon';
import StatusDot from './StatusDot';
import './ToolBlocks.css';

export interface ToolBlockShellProps {
  category: ToolCategory;
  /** Custom title key; defaults to the category's meta title. */
  titleKey?: string;
  summary?: React.ReactNode;
  status: UnifiedToolStatus;
  /** Extra header chips (e.g. diff counts, progress badges). */
  chips?: React.ReactNode;
  /** When false the header is not clickable and no chevron renders. */
  expandable?: boolean;
  children?: React.ReactNode;
}

/** Shared card container: colored icon + title + summary + status dot header,
 * grid 0fr->1fr collapsible body. Auto-expands while running, auto-collapses on
 * settle unless the user toggled it (userTouched). */
const ToolBlockShell: React.FC<ToolBlockShellProps> = ({ category, titleKey, summary, status, chips, expandable = true, children }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [userTouched, setUserTouched] = useState(false);
  const prevStatusRef = useRef<UnifiedToolStatus>(status);

  useEffect(() => {
    if (userTouched) {
      prevStatusRef.current = status;
      return;
    }
    if (status === 'running' || status === 'pending') setExpanded(true);
    else if (prevStatusRef.current === 'running' || prevStatusRef.current === 'pending') setExpanded(false);
    prevStatusRef.current = status;
  }, [status, userTouched]);

  const toggle = () => {
    if (!expandable) return;
    setUserTouched(true);
    setExpanded((prev) => !prev);
  };

  const meta = TOOL_BLOCK_META[category];
  return (
    <div className='tool-block'>
      <div
        role='button'
        aria-expanded={expanded}
        aria-label={t(titleKey ?? meta.titleKey)}
        className='tool-block__header'
        onClick={toggle}
        tabIndex={expandable ? 0 : -1}
        onKeyDown={(e) => {
          if (expandable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {expandable ? (
          <span className='text-3' style={{ fontSize: 10, display: 'inline-flex' }}>
            {expanded ? <IconDown style={{ fontSize: 10 }} /> : <IconRight style={{ fontSize: 10 }} />}
          </span>
        ) : null}
        <CategoryIcon category={category} />
        <span className='tool-block__title'>{t(titleKey ?? meta.titleKey)}</span>
        {chips}
        {summary !== undefined && (
          <span className='tool-block__summary' title={typeof summary === 'string' ? summary : undefined}>
            {summary}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <StatusDot status={status} />
        </span>
      </div>
      {expandable && children ? (
        <div data-testid='tool-block-body' className={`tool-block__body${expanded ? ' tool-block__body--open' : ''}`}>
          <div className='tool-block__body-inner'>{children}</div>
        </div>
      ) : null}
    </div>
  );
};

export default ToolBlockShell;
