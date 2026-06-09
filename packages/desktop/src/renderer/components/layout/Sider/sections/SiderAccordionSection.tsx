/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reusable VS Code-style collapsible section used by the Sider workspace
 * panel. Hands a real `<button>` to the toggle so the entire header
 * (chevron + title) is keyboard-activatable, while action buttons on the
 * right are kept OUTSIDE the toggle so a click on, e.g. Refresh doesn't
 * collapse the section.
 *
 * The expanded body uses `flex: 1; min-height: 0; overflow: auto` so
 * multiple open sections share the available vertical space (VS Code's
 * behavior) rather than growing to fit content. The collapsed state is
 * `flex: 0 0 auto` so the section shrinks to its header height.
 *
 * Persists open/closed to `localStorage[storageKey]` when provided. Errors
 * are swallowed — the section always falls back to the `defaultExpanded`
 * prop so a corrupted localStorage can't lock the UI.
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import { Down } from '@icon-park/react';
import panelStyles from '../SiderWorkspacePanel.module.css';

type Props = {
  title: React.ReactNode;
  defaultExpanded?: boolean;
  storageKey?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  'data-testid'?: string;
};

const SiderAccordionSection: React.FC<Props> = ({
  title,
  defaultExpanded = true,
  storageKey,
  actions,
  children,
  'data-testid': testId,
}) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const reactId = useId();
  const bodyId = `sider-accordion-body-${reactId}`;

  // Hydrate the persisted state on mount only — writes happen in the toggle
  // effect below. Wrapped in try/catch so a Storage quota / SecurityError
  // never blocks the UI.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      setHydrated(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'true' || stored === 'false') {
        setExpanded(stored === 'true');
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, expanded ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [hydrated, storageKey, expanded]);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <section
      className={`${panelStyles.accordionSection} ${expanded ? panelStyles.accordionSectionOpen : panelStyles.accordionSectionCollapsed}`}
      data-testid={testId}
    >
      <div className={panelStyles.header}>
        <button
          type='button'
          className={panelStyles.toggle}
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
        >
          <Down
            theme='outline'
            size={14}
            fill='currentColor'
            className={`${panelStyles.chevron} ${expanded ? panelStyles.chevronOpen : ''}`}
            aria-hidden='true'
          />
          <h3 className={panelStyles.title}>{title}</h3>
        </button>
        {actions ? <div className={panelStyles.actions}>{actions}</div> : null}
      </div>
      {expanded ? (
        <div
          id={bodyId}
          className={panelStyles.accordionBody}
          role='region'
          aria-label={typeof title === 'string' ? title : undefined}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
};

export default SiderAccordionSection;
