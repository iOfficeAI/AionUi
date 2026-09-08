import { Button, Empty, InputNumber, Modal, Spin, Table, Tabs, Tag } from '@arco-design/web-react';
import type { TableColumnProps } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useEffect, useMemo, useState } from 'react';
import type { SalesPlanDetailClient } from './hooks/useSalesPlanDetail';
import {
  adjustmentDimensionName,
  adjustmentDimensionsFrom,
  adjustmentRecordDraft,
  adjustmentScopeRows,
  createSalesPlanAdjustmentRecords,
  groupSalesPlanAdjustmentRecords,
  updateAggregateAmount,
  updateAggregateQuantity,
  updateCustomerAmount,
  updateCustomerQuantity,
  type SalesPlanAdjustmentDraft,
  type SalesPlanAdjustmentGroup,
  type SalesPlanAdjustmentRecord,
} from './models/salesPlanAdjustmentModel';
import { salesPlanSkusMatchVersion } from './models/salesPlanDetailModel';
import { addExactDecimals, formatExactDecimal, type RegionalApprovalLiveRow } from './regionalApprovalQueryModel';
import type { ApprovalDimension } from './regionalApprovalFixture';
import styles from './RegionalApprovalLiveAdjustmentDialog.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; records: SalesPlanAdjustmentRecord[] }
  | { status: 'error' };

const isZero = (value: string) => /^-?0(?:\.0+)?$/.test(value);
const signed = (value: string, currency = false) => {
  const prefix = value.startsWith('-') || isZero(value) ? '' : '+';
  return `${prefix}${currency ? '¥' : ''}${formatExactDecimal(value)}`;
};

const RegionalApprovalLiveAdjustmentDialog: React.FC<{
  visible: boolean;
  readOnly?: boolean;
  rows: readonly RegionalApprovalLiveRow[];
  row: RegionalApprovalLiveRow;
  initialDimension: ApprovalDimension;
  drafts: Readonly<Record<string, SalesPlanAdjustmentDraft>>;
  t: TFunction;
  client?: SalesPlanDetailClient;
  onDraftsChange: (recordIds: string[], drafts: SalesPlanAdjustmentDraft[]) => void;
  onEdit?: () => void;
  onClose: () => void;
}> = ({
  visible,
  readOnly = true,
  rows,
  row,
  initialDimension,
  drafts,
  t,
  client,
  onDraftsChange,
  onEdit,
  onClose,
}) => {
  const dimensions = useMemo(() => adjustmentDimensionsFrom(initialDimension), [initialDimension]);
  const [initialDrafts] = useState(drafts);
  const [dimension, setDimension] = useState<ApprovalDimension>(dimensions[0]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const scopedRows = useMemo(() => adjustmentScopeRows(rows, row, initialDimension), [initialDimension, row, rows]);

  useEffect(() => setDimension(dimensions[0]), [dimensions]);

  useEffect(() => {
    if (!visible || !client) {
      setState(client ? { status: 'loading' } : { status: 'error' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    void Promise.all(
      scopedRows.map(async (plan) => {
        const skus = await client.versionSkus.invoke({ versionId: plan.versionId, signal: controller.signal });
        if (!salesPlanSkusMatchVersion(plan.versionId, skus)) throw new Error('version mismatch');
        return { plan, skus };
      })
    )
      .then((entries) => {
        if (controller.signal.aborted) return;
        const records = createSalesPlanAdjustmentRecords(entries).map((record) => {
          const draft = initialDrafts[record.recordId];
          if (draft && !readOnly) {
            record.qty = draft.qty;
            record.amount = draft.amount;
          }
          return record;
        });
        setState({ status: 'success', records });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [client, initialDrafts, scopedRows, visible, readOnly]);

  const records = state.status === 'success' ? state.records : [];
  const groups = useMemo(() => groupSalesPlanAdjustmentRecords(records, dimension), [dimension, records]);
  const totalDelta = addExactDecimals(groups.map((group) => group.quantityDelta));

  const commit = (next: SalesPlanAdjustmentRecord[]) => {
    if (readOnly) return;
    setState({ status: 'success', records: next });
    onDraftsChange(
      next.map((record) => record.recordId),
      next
        .filter((record) => record.qty !== String(record.sku.qty) || record.amount !== String(record.sku.amt))
        .map(adjustmentRecordDraft)
    );
  };

  const updateQuantity = (group: SalesPlanAdjustmentGroup, value: number | undefined) => {
    if (value === undefined) return;
    commit(
      dimension === 'customer'
        ? updateCustomerQuantity(records, group, value)
        : updateAggregateQuantity(records, group, value)
    );
  };
  const updateAmount = (group: SalesPlanAdjustmentGroup, value: number | undefined) => {
    if (value === undefined) return;
    commit(
      dimension === 'customer'
        ? updateCustomerAmount(records, group, value)
        : updateAggregateAmount(records, group, value)
    );
  };

  const columns: TableColumnProps<SalesPlanAdjustmentGroup>[] = [
    {
      title: t(`common.assistantSurface.regionalApproval.liveAdjustment.dimensions.${dimension}`),
      dataIndex: 'dimensionName',
      width: 150,
      render: (name) => <strong>{name || '—'}</strong>,
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.sku'),
      width: 180,
      render: (_, group) => (
        <span className={styles.skuCell}>
          <strong>{group.skuCode}</strong>
          <small>{group.categoryName || '—'}</small>
        </span>
      ),
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.baseQty'),
      width: 110,
      render: (value) => formatExactDecimal(String(value)),
      dataIndex: 'baseQty',
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.qty'),
      width: 130,
      render: (_, group) => (
        <InputNumber
          disabled={readOnly}
          min={0}
          precision={0}
          value={Number(group.qty)}
          aria-label={t('common.assistantSurface.regionalApproval.liveAdjustment.editQty', { sku: group.skuCode })}
          onChange={(value) => updateQuantity(group, value)}
        />
      ),
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.baseAmount'),
      width: 120,
      render: (value) => formatExactDecimal(String(value)),
      dataIndex: 'baseAmount',
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.amount'),
      width: 140,
      render: (_, group) => (
        <InputNumber
          disabled={readOnly}
          min={0}
          precision={0}
          value={Number(group.amount)}
          aria-label={t('common.assistantSurface.regionalApproval.liveAdjustment.editAmount', { sku: group.skuCode })}
          onChange={(value) => updateAmount(group, value)}
        />
      ),
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.deltaQty'),
      width: 90,
      render: (_, group) => (
        <span className={group.quantityDelta.startsWith('-') ? styles.negative : styles.positive}>
          {signed(group.quantityDelta)}
        </span>
      ),
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.deltaAmount'),
      width: 100,
      render: (_, group) => (
        <span className={group.amountDelta.startsWith('-') ? styles.negative : styles.positive}>
          {signed(group.amountDelta)}
        </span>
      ),
    },
    {
      title: t('common.assistantSurface.regionalApproval.liveAdjustment.columns.aiAdvice'),
      width: 170,
      render: () => (
        <span className={styles.noAdvice}>{t('common.assistantSurface.regionalApproval.liveAdjustment.noAdvice')}</span>
      ),
    },
  ];

  return (
    <Modal
      visible={visible}
      className={styles.modal}
      title={t('common.assistantSurface.regionalApproval.liveAdjustment.title', {
        organization: adjustmentDimensionName(row, initialDimension),
      })}
      footer={
        <div className={styles.footer}>
          <span>
            {t(
              onEdit
                ? 'common.assistantSurface.regionalApproval.liveAdjustment.editScope'
                : readOnly
                  ? 'common.assistantSurface.regionalApproval.liveAdjustment.readOnlyReason'
                  : 'common.assistantSurface.regionalApproval.liveAdjustment.footer'
            )}
          </span>
          {onEdit ? (
            <Button type='primary' onClick={onEdit}>
              {t('common.assistantSurface.regionalApproval.liveAdjustment.editCurrent')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('common.assistantSurface.regionalApproval.liveAdjustment.close')}</Button>
        </div>
      }
      onCancel={onClose}
      unmountOnExit
    >
      <div className={styles.body}>
        <div className={styles.dimensionBar}>
          <Tabs activeTab={dimension} onChange={(value) => setDimension(value as ApprovalDimension)}>
            {dimensions.map((item) => (
              <Tabs.TabPane
                key={item}
                title={t(`common.assistantSurface.regionalApproval.liveAdjustment.dimensions.${item}`)}
              />
            ))}
          </Tabs>
          <span>
            {t('common.assistantSurface.regionalApproval.liveAdjustment.summary', {
              delta: signed(totalDelta),
              dimension: t(`common.assistantSurface.regionalApproval.liveAdjustment.dimensions.${dimension}`),
            })}
          </span>
          <Tag color={readOnly ? 'gray' : 'arcoblue'}>
            {t(
              readOnly
                ? 'common.assistantSurface.regionalApproval.liveAdjustment.readOnly'
                : 'common.assistantSurface.regionalApproval.liveAdjustment.localDraft'
            )}
          </Tag>
        </div>
        {state.status === 'loading' ? (
          <div className={styles.loading}>
            <Spin />
          </div>
        ) : state.status === 'error' ? (
          <Empty description={t('common.assistantSurface.regionalApproval.liveAdjustment.loadError')} />
        ) : (
          <Table
            borderCell
            rowKey='id'
            columns={columns}
            data={groups}
            pagination={false}
            scroll={{ x: 1190, y: 480 }}
            noDataElement={<Empty description={t('common.assistantSurface.regionalApproval.liveAdjustment.empty')} />}
          />
        )}
      </div>
    </Modal>
  );
};

export default RegionalApprovalLiveAdjustmentDialog;
