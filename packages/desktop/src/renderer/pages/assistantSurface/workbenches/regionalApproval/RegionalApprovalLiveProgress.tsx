import type { GeaSalesPlanListItem } from '@/common/adapter/ipcBridge';
import { Alert, Button, Checkbox, Empty, Spin, Tag, Tree, Typography } from '@arco-design/web-react';
import type { TreeProps } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useMemo, useState } from 'react';
import { buildSalesPlanProgressTree, type SalesPlanProgressNode } from './models/salesPlanProgressModel';
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
          <span>
            <Typography.Text>
              {node.name ??
                (node.code
                  ? t('common.assistantSurface.regionalApproval.progressDialog.codedNode', {
                      level: t(`common.assistantSurface.regionalApproval.progressDialog.levels.${node.level}`),
                      code: node.code,
                    })
                  : t('common.assistantSurface.regionalApproval.progressDialog.missingNode', {
                      level: t(`common.assistantSurface.regionalApproval.progressDialog.levels.${node.level}`),
                    }))}
            </Typography.Text>{' '}
            <Tag color={node.pending ? 'orange' : 'green'}>
              {t('common.assistantSurface.regionalApproval.progressDialog.counts', {
                total: node.total,
                pending: node.pending,
                completed: node.completed,
              })}
            </Tag>
          </span>
        ),
        children: project(node.children),
      }));
  const data = project(tree);
  return (
    <section aria-label={t('common.assistantSurface.regionalApproval.progressDialog.treeLabel')}>
      <Typography.Paragraph type='secondary'>
        {t('common.assistantSurface.regionalApproval.progressDialog.treeScope')}
      </Typography.Paragraph>
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
          <Checkbox checked={pendingOnly} onChange={setPendingOnly}>
            {t('common.assistantSurface.regionalApproval.progressDialog.pendingOnly')}
          </Checkbox>
          {data.length ? (
            <Tree
              blockNode
              selectable={false}
              actionOnClick='expand'
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              treeData={data}
            />
          ) : (
            <Empty description={t('common.assistantSurface.regionalApproval.progressDialog.empty')} />
          )}
        </>
      )}
    </section>
  );
};

export default RegionalApprovalLiveProgress;
