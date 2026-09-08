import type { GeaSalesPlanListItem } from '@/common/adapter/ipcBridge';
import { Alert, Button, Checkbox, Empty, Progress, Spin, Tag, Tree } from '@arco-design/web-react';
import type { TreeProps } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useMemo, useState } from 'react';
import { buildSalesPlanProgressTree, type SalesPlanProgressNode } from './models/salesPlanProgressModel';
import styles from './RegionalApprovalWorkbench.module.css';
import type { RegionalApprovalQueryError } from './useRegionalApprovalQuery';

const RegionalApprovalLiveProgress: React.FC<{
  records?: readonly GeaSalesPlanListItem[];
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: RegionalApprovalQueryError;
  t: TFunction;
  onRetry: () => void;
}> = ({ records, status, error, t, onRetry }) => {
  const [pendingOnly, setPendingOnly] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const tree = useMemo(() => buildSalesPlanProgressTree(records ?? []), [records]);
  const project = (nodes: SalesPlanProgressNode[]): NonNullable<TreeProps['treeData']> =>
    nodes
      .filter((node) => !pendingOnly || node.pending > 0)
      .map((node) => ({
        key: node.key,
        title: (
          <span
            className={styles.progressTreeRow}
            aria-label={t('common.assistantSurface.regionalApproval.progressDialog.counts', node)}
          >
            <span className={styles.progressTreeName} data-level={node.level}>
              <span>
                {node.name ??
                  (node.code
                    ? t('common.assistantSurface.regionalApproval.progressDialog.codedNode', {
                        level: t(`common.assistantSurface.regionalApproval.progressDialog.levels.${node.level}`),
                        code: node.code,
                      })
                    : t('common.assistantSurface.regionalApproval.progressDialog.missingNode', {
                        level: t(`common.assistantSurface.regionalApproval.progressDialog.levels.${node.level}`),
                      }))}
              </span>
              {node.level === 'customer' && node.name && node.code ? <small>{node.code}</small> : null}
            </span>
            <span className={styles.progressTreeCompletion}>
              <Progress
                percent={Math.round((node.completed / node.total) * 100)}
                size='small'
                showText={false}
                color={node.pending ? 'rgb(var(--warning-6))' : 'rgb(var(--success-6))'}
              />
              <span>
                {node.completed} / {node.total}
              </span>
            </span>
            <span className={styles.progressTreePending}>{node.pending}</span>
            <Tag className={styles.progressTreeStatus} color={node.pending ? 'orange' : 'green'}>
              {t(
                `common.assistantSurface.regionalApproval.progressDialog.${node.pending ? (node.completed ? 'inProgress' : 'awaitingReview') : 'completed'}`
              )}
            </Tag>
          </span>
        ),
        children: project(node.children),
      }));
  const data = project(tree);
  return (
    <section
      className={styles.progressTreeSection}
      aria-label={t('common.assistantSurface.regionalApproval.progressDialog.treeLabel')}
    >
      <p className={styles.progressTreeScope}>
        {t('common.assistantSurface.regionalApproval.progressDialog.treeScope')}
      </p>
      {status === 'loading' || status === 'idle' ? (
        <Spin />
      ) : status === 'error' ? (
        <>
          <Alert
            type='error'
            content={t(`common.assistantSurface.regionalApproval.query.errors.${error ?? 'failed'}`)}
          />
          <Button onClick={onRetry}>{t('common.retry')}</Button>
        </>
      ) : (
        <>
          <div className={styles.progressTreeToolbar}>
            <Checkbox checked={pendingOnly} onChange={setPendingOnly}>
              {t('common.assistantSurface.regionalApproval.progressDialog.pendingOnly')}
            </Checkbox>
          </div>
          {data.length ? (
            <div className={styles.progressTreeTable}>
              <div className={styles.progressTreeHeader} aria-hidden='true'>
                <span>{t('common.assistantSurface.regionalApproval.progressDialog.organization')}</span>
                <span>{t('common.assistantSurface.regionalApproval.progressDialog.completion')}</span>
                <span>{t('common.assistantSurface.regionalApproval.progressDialog.pendingCount')}</span>
                <span>{t('common.assistantSurface.regionalApproval.progressDialog.status')}</span>
              </div>
              <Tree
                className={styles.progressTree}
                blockNode
                selectable={false}
                actionOnClick='expand'
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                treeData={data}
              />
            </div>
          ) : (
            <Empty description={t('common.assistantSurface.regionalApproval.progressDialog.empty')} />
          )}
        </>
      )}
    </section>
  );
};

export default RegionalApprovalLiveProgress;
