/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Diff view for one selected resource. Request-driven, not subscribed: the patch
 * is pulled with `scm/diff` on selection and is not refreshed by status pushes
 * (protocol.md §diff 请求式、status 订阅式).
 *
 * This round is deliberately plain — a unified patch in a scrollable pre. Gutter
 * decorations and side-by-side are deferred; "can be read at all" is the bar.
 */

import { Button } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { diffAnchors, type ScmResource, resourceName } from './scmModel';
import { fetchScmDiff, type ScmDiffResult } from './scmStore';

export type ScmDiffViewProps = {
  repoId: string;
  /** Whether the owning repo has a staging area — picks the ContentRef pair. */
  staging: boolean;
  resource: ScmResource;
  onClose: () => void;
};

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; result: ScmDiffResult };

export const ScmDiffView: React.FC<ScmDiffViewProps> = ({ repoId, staging, resource, onClose }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const { pe_id: peId, relative_path: relativePath } = resource.file;
  const { from, to } = diffAnchors(resource, staging);

  useEffect(() => {
    // `cancelled` drops a late response after the selection moved on — without it
    // a slow diff for the previous row could overwrite the current one.
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchScmDiff({ repository: repoId, file: { pe_id: peId, relative_path: relativePath }, from, to })
      .then((result) => {
        if (!cancelled) setState({ kind: 'ready', result });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, peId, relativePath, from, to]);

  return (
    <div data-scm-diff className='flex flex-col min-h-0 flex-1 border-t border-[var(--bg-3)]'>
      <div className='flex items-center gap-4px px-8px py-4px flex-shrink-0 text-12px text-t-secondary'>
        <span className='overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0'>{resourceName(resource)}</span>
        <Button
          type='text'
          size='mini'
          className='flex-shrink-0'
          icon={<Close theme='outline' size='12' />}
          aria-label={t('conversation.explorer.scm.diff.close')}
          onClick={onClose}
        />
      </div>
      <div className='flex-1 min-h-0 overflow-auto px-8px pb-8px'>
        {state.kind === 'loading' && (
          <div className='text-t-secondary text-13px'>{t('conversation.explorer.scm.diff.loading')}</div>
        )}
        {state.kind === 'error' && (
          <div className='text-t-secondary text-13px'>{t('conversation.explorer.scm.diff.failed')}</div>
        )}
        {state.kind === 'ready' && <DiffBody result={state.result} />}
      </div>
    </div>
  );
};

/** Body of a loaded diff: binary placeholder, patch text, or an empty notice. */
const DiffBody: React.FC<{ result: ScmDiffResult }> = ({ result }) => {
  const { t } = useTranslation();
  if (result.binary === true) {
    return <div className='text-t-secondary text-13px'>{t('conversation.explorer.scm.diff.binary')}</div>;
  }
  if (!result.patch) {
    return <div className='text-t-secondary text-13px'>{t('conversation.explorer.scm.diff.empty')}</div>;
  }
  return (
    <>
      <pre className='text-12px whitespace-pre font-mono m-0'>{result.patch}</pre>
      {result.truncated === true && (
        <div className='text-t-tertiary text-12px pt-4px'>{t('conversation.explorer.scm.diff.truncated')}</div>
      )}
    </>
  );
};
