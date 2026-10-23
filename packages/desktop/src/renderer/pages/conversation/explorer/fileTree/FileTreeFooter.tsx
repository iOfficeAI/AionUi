/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useFileTreeActivity } from './fileTreeActivityStore';
import styles from './fileTreeShimmer.module.css';

export type FileTreeFooterProps = {
  selectedPath?: string | null;
};

export const FileTreeFooter: React.FC<FileTreeFooterProps> = ({ selectedPath }) => {
  const { latestChip } = useFileTreeActivity();

  if (!selectedPath && !latestChip) {
    return null;
  }

  const toneClass =
    latestChip?.tone === 'read' ? 'text-[#a855f7]' : latestChip?.tone === 'write' ? 'text-[#f97316]' : 'text-[#10b981]';

  const pulseDotClass =
    latestChip?.tone === 'read'
      ? styles.pulseDotRead
      : latestChip?.tone === 'write'
        ? styles.pulseDotWrite
        : styles.pulseDotCommit;

  return (
    <div className='flex items-center justify-between px-10px py-4px text-11px border-t border-[var(--bg-3)] bg-[var(--bg-1)] select-none font-mono'>
      {/* Selected file path */}
      <div className='min-w-0 flex-1 truncate text-t-tertiary mr-8px' title={selectedPath ?? undefined}>
        {selectedPath ? `selected: ${selectedPath}` : ''}
      </div>

      {/* Latest Agent Activity Chip */}
      {latestChip && (
        <div
          className={`flex items-center gap-4px flex-shrink-0 font-medium ${toneClass}`}
          title={`${latestChip.label} ${latestChip.detail}`}
        >
          {latestChip.inFlight && <span className={`${styles.pulseDot} ${pulseDotClass}`} />}
          <span className='truncate max-w-160px'>{latestChip.label}</span>
        </div>
      )}
    </div>
  );
};
