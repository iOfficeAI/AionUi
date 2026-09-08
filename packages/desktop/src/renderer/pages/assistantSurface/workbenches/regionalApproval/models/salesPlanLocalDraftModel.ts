import type { GeaSalesPlanDetail, GeaSalesPlanListItem, GeaSalesPlanSkuAdjustment } from '@/common/adapter/ipcBridge';
import { addExactDecimals, multiplyExactDecimals } from '../regionalApprovalQueryModel';
import { salesPlanEditableQuantity } from './salesPlanAccessModel';
import { salesPlanSkusMatchVersion } from './salesPlanDetailModel';

export type SalesPlanLocalDraft = {
  planId: string;
  versionId: string;
  status: number;
  sourceSnapshot: string;
  adjustments: GeaSalesPlanSkuAdjustment[];
  remark: string;
};

export type SalesPlanLocalDraftStore = Record<string, SalesPlanLocalDraft>;
const DECIMAL = /^[+-]?\d{1,15}(?:\.\d{1,3})?$/;

/** Local draft freshness only; never sent as a server-issued authority or snapshot token. */
export const salesPlanDraftSnapshot = (
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status'>,
  detail: GeaSalesPlanDetail
): string | undefined => {
  const version = detail.currentVersion;
  if (
    version.planId !== row.planId ||
    version.id !== row.versionId ||
    version.status !== row.status ||
    !version.effective ||
    !salesPlanSkusMatchVersion(row.versionId, detail.skus)
  )
    return undefined;
  return JSON.stringify([
    row.planId,
    row.versionId,
    row.status,
    detail.skus
      .map((sku) => [
        String(sku.skuCode),
        salesPlanEditableQuantity(sku, row.status),
        String(sku.price),
        sku.qty,
        sku.regionConfirmedQty,
        sku.provinceConfirmedQty,
        sku.areaConfirmedQty,
        sku.categoryConfirmedQty,
      ])
      .toSorted((left, right) => String(left[0]).localeCompare(String(right[0]))),
  ]);
};

export const salesPlanDraftMatches = (
  draft: SalesPlanLocalDraft | undefined,
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status'>,
  detail: GeaSalesPlanDetail
): draft is SalesPlanLocalDraft => {
  if (
    !draft ||
    draft.planId !== row.planId ||
    draft.versionId !== row.versionId ||
    draft.status !== row.status ||
    draft.sourceSnapshot !== salesPlanDraftSnapshot(row, detail) ||
    !Array.isArray(draft.adjustments) ||
    typeof draft.remark !== 'string' ||
    Array.from(draft.remark).length > 1000
  )
    return false;
  const codes = new Set<string>();
  return draft.adjustments.every((adjustment) => {
    if (
      !adjustment ||
      typeof adjustment.skuCode !== 'string' ||
      typeof adjustment.adjustQty !== 'string' ||
      !DECIMAL.test(adjustment.adjustQty) ||
      codes.has(adjustment.skuCode)
    )
      return false;
    codes.add(adjustment.skuCode);
    const sku = detail.skus.find((item) => String(item.skuCode) === adjustment.skuCode);
    const baseline = sku && salesPlanEditableQuantity(sku, row.status);
    const qty = baseline === undefined ? '—' : addExactDecimals([baseline, adjustment.adjustQty]);
    return !!sku && qty !== '—' && !qty.startsWith('-') && multiplyExactDecimals(qty, String(sku.price)) !== undefined;
  });
};

const storageKey = (scope: string) => `aionui:sales-plan-local-drafts:v1:${encodeURIComponent(scope)}`;
export const readSalesPlanLocalDrafts = (scope: string | undefined): SalesPlanLocalDraftStore => {
  if (!scope) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(scope)) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SalesPlanLocalDraftStore) : {};
  } catch {
    return {};
  }
};

/** A failed local write must be reported, rather than displaying a false saved state. */
export const writeSalesPlanLocalDrafts = (scope: string, drafts: SalesPlanLocalDraftStore): void => {
  window.localStorage.setItem(storageKey(scope), JSON.stringify(drafts));
};
