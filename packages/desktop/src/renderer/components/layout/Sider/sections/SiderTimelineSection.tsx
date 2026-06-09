/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Timeline view for the active editor buffer — a VS Code-style "Timeline"
 * panel that lists every meaningful version of the file (commits + local
 * snapshots), newest first.
 *
 * Two data sources are merged into a single descending list:
 *   - Git history (`ipcBridge.git.getFileLog`) — only available in
 *     git-initialised workspaces. Each commit becomes a `git` row.
 *   - Local history (`ipcBridge.localHistory.listEntries`) — the
 *     content-addressed snapshot store owned by `LocalHistoryService`.
 *     Always available, captures every save/agent-edit/auto-save/restore.
 *
 * Both are fetched in parallel via SWR; the fetcher returns a single
 * unified array. We debounce the SWR key by 300ms so scrubbing through
 * tabs produces at most one new request after the user settles.
 *
 * Rows are clickable — clicking a local-history row opens
 * `TimelineDiffModal` so the user can review the diff and restore. Git
 * rows are kept for context but don't open a modal yet (we'd need a
 * `git show <hash>:<path>` IPC to fetch historical file content).
 *
 * The component calls useEditorContext directly (rather than receiving
 * `filePath`/`workspace` as props) so it's the only thing that
 * re-renders on every keystroke or tab switch — the surrounding
 * accordion chrome stays put. React.memo gives us the same isolation
 * for parent-driven re-renders.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Spin, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { GitFileLogEntry } from '@/common/types/git/gitTypes';
import type { LocalHistoryEntry, LocalHistorySource } from '@/common/types/localHistory/localHistoryTypes';
import { useEditorContext } from '@renderer/pages/conversation/Editor/EditorContext';
import panelStyles from '../SiderWorkspacePanel.module.css';
import TimelineDiffModal, { type TimelineRowItem } from './TimelineDiffModal';

const TIMELINE_DEBOUNCE_MS = 300;
const TIMELINE_MAX_COUNT = 50;

type TimelineKey = {
  workspace: string;
  filePath: string;
} | null;

const formatDate = (iso: string): string => {
  // ISO-8601 → toLocaleDateString + toLocaleTimeString, no date library.
  // `toLocaleString` would lump them together; splitting keeps the row
  // compact while still showing time when the user cares.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};

const formatEpoch = (timestamp: number): string => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return String(timestamp);
  return formatDate(d.toISOString());
};

/** Map a LocalHistory source to its i18n key under
 * `conversation.sider.timelineLocal*`. Falls back to the raw source
 * string if the key is missing (it never should be in en-US, but be
 * defensive in case a locale is out of date). */
const localSourceKey = (source: LocalHistorySource): string => `conversation.sider.timelineLocal${source.charAt(0).toUpperCase()}${source.slice(1)}`;

const SiderTimelineSection: React.FC = () => {
  const { t } = useTranslation();
  const { activeBuffer } = useEditorContext();

  const filePath = activeBuffer?.filePath ?? null;
  const workspace = activeBuffer?.workspace ?? null;

  // Debounce the SWR key — switching tabs rapidly should produce at most
  // one new fetch after the user settles on a file, not one per
  // keystroke.
  const [debounced, setDebounced] = useState<TimelineKey>(null);
  useEffect(() => {
    if (!filePath || !workspace) {
      setDebounced(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setDebounced({ workspace, filePath });
    }, TIMELINE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [filePath, workspace]);

  const swrKey = debounced ? `sider.timeline.${debounced.workspace}.${debounced.filePath}` : null;

  // Parallel fetch — `Promise.all` short-circuits nothing: a missing
  // git repo or local-history service failure is treated as an empty
  // list for that source, so the OTHER source still renders.
  const fetcher = async (): Promise<TimelineRowItem[]> => {
    if (!debounced) return [];
    const [gitRes, localRes] = await Promise.all([
      ipcBridge.git.getFileLog
        .invoke({
          workspace: debounced.workspace,
          file_path: debounced.filePath,
          max_count: TIMELINE_MAX_COUNT,
        })
        .catch((): null => null),
      ipcBridge.localHistory.listEntries
        .invoke({ file_path: debounced.filePath })
        .catch((): null => null),
    ]);

    const gitEntries: GitFileLogEntry[] = gitRes?.success ? (gitRes.data ?? []) : [];
    const localEntries: LocalHistoryEntry[] = localRes?.success ? (localRes.data ?? []) : [];

    const rows: TimelineRowItem[] = [
      ...gitEntries.map(
        (entry): TimelineRowItem => ({
          kind: 'git',
          entry,
          // Pre-compute the sort key here so the comparator below is a
          // cheap subtraction, and so callers (modal) can reuse it.
          timestamp: new Date(entry.date).getTime(),
        })
      ),
      ...localEntries.map(
        (entry): TimelineRowItem => ({
          kind: 'local',
          entry,
          timestamp: entry.timestamp,
        })
      ),
    ];

    // Newest first. `Number.isFinite` guards against malformed git
    // dates — bad entries sink to the bottom rather than NaN-poisoning
    // the comparator.
    rows.sort((a, b) => {
      const aT = Number.isFinite(a.timestamp) ? a.timestamp : 0;
      const bT = Number.isFinite(b.timestamp) ? b.timestamp : 0;
      return bT - aT;
    });
    return rows;
  };

  const { data, isLoading, mutate } = useSWR<TimelineRowItem[]>(swrKey, fetcher, { revalidateOnFocus: false });

  // Modal state: clicking a row sets this; null = closed.
  const [selectedItem, setSelectedItem] = useState<TimelineRowItem | null>(null);

  const handleRowClick = useCallback((item: TimelineRowItem) => {
    setSelectedItem(item);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedItem(null);
  }, []);

  // After a successful restore or delete, the local-history list
  // changes — revalidate so the next render reflects it.
  const handleMutated = useCallback(() => {
    void mutate();
  }, [mutate]);

  const rows = useMemo(() => data ?? [], [data]);

  if (!filePath || !workspace) {
    return <div className={panelStyles.timelineEmpty}>{t('conversation.sider.timelineNoFile')}</div>;
  }

  if (isLoading) {
    return (
      <div className={panelStyles.timelineEmpty}>
        <Spin size={14} />
        <span className={panelStyles.timelineLoadingText}>{t('conversation.sider.timelineLoading')}</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className={panelStyles.timelineEmpty}>{t('conversation.sider.timelineEmpty')}</div>;
  }

  return (
    <>
      <ul className={panelStyles.timelineList}>
        {rows.map((row) => {
          // Stable key per source: git commits are uniquely identified
          // by hash; local entries have a stable id.
          const rowKey = row.kind === 'git' ? `git:${row.entry.hash}` : `local:${row.entry.id}`;
          if (row.kind === 'git') {
            const entry = row.entry;
            return (
              <li
                key={rowKey}
                className={panelStyles.timelineRow}
                // Git rows are clickable too — the modal will show a
                // "not yet supported" empty state for git content. We
                // keep them clickable so the affordance is consistent
                // and so adding `git show` IPC later is purely a
                // model-side change.
                onClick={() => handleRowClick(row)}
                role='button'
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick(row);
                  }
                }}
                aria-label={entry.subject}
              >
                <div className={panelStyles.timelineSubject} title={entry.subject}>
                  {entry.subject}
                </div>
                <div className={panelStyles.timelineMeta}>
                  <span className={panelStyles.timelineHash}>{entry.shortHash}</span>
                  <span className={panelStyles.timelineAuthor}>{entry.author}</span>
                  <span className={panelStyles.timelineDate}>{formatDate(entry.date)}</span>
                </div>
              </li>
            );
          }
          // Local history row
          const entry = row.entry;
          const sourceLabel = t(localSourceKey(entry.source), { defaultValue: entry.source });
          return (
            <li
              key={rowKey}
              className={panelStyles.timelineRow}
              onClick={() => handleRowClick(row)}
              role='button'
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRowClick(row);
                }
              }}
              aria-label={`${sourceLabel} ${formatEpoch(entry.timestamp)}`}
            >
              <div className={panelStyles.timelineSubject}>
                <span>{t('conversation.sider.timelineLocalSubject', { defaultValue: 'Local History' })}</span>
                <Tag size='small' color='arcoblue' className={panelStyles.timelineBadge}>
                  {sourceLabel}
                </Tag>
              </div>
              <div className={panelStyles.timelineMeta}>
                <span className={panelStyles.timelineLocalLabel}>{t('conversation.sider.timelineLocalMeta', { defaultValue: 'Local' })}</span>
                <span className={panelStyles.timelineDate}>{formatEpoch(entry.timestamp)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <TimelineDiffModal
        visible={selectedItem !== null}
        item={selectedItem}
        activeBuffer={activeBuffer}
        onClose={handleCloseModal}
        onMutated={handleMutated}
      />
    </>
  );
};

export default React.memo(SiderTimelineSection);
