/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branch } from '@icon-park/react';
import React from 'react';

/**
 * Compact "current branch" pill, shown in the Changes section header next to the
 * section title (VS Code SCM title parity).
 *
 * Pure presentation: takes the resolved branch name as a prop and renders nothing
 * when it is absent — mirroring the RepoRow convention that a detached/unknown
 * head shows nothing rather than a lone icon. Truncates long names and keeps the
 * full name on hover via the native `title`.
 */
const ScmBranchPill: React.FC<{ headName?: string; className?: string }> = ({ headName, className = '' }) => {
  if (!headName) {
    return null;
  }

  return (
    <span
      data-testid='scm-branch-pill'
      title={headName}
      className={`flex items-center gap-2px flex-shrink-0 min-w-0 max-w-[160px] text-t-tertiary text-12px ${className}`}
    >
      <Branch theme='outline' size='12' className='flex-shrink-0' />
      <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{headName}</span>
    </span>
  );
};

export default ScmBranchPill;
