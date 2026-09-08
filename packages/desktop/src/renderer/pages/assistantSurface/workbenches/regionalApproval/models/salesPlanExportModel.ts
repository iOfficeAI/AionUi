import type { GeaSalesPlanListItem, GeaSalesPlanSku } from '@/common/adapter/ipcBridge';
import { addExactDecimals } from '../regionalApprovalQueryModel';

export const SALES_PLAN_EXPORT_AMOUNT_PAIRS = [
  ['qty', 'amt'],
  ['regionConfirmedQty', 'regionConfirmedAmount'],
  ['provinceConfirmedQty', 'provinceConfirmedAmount'],
  ['areaConfirmedQty', 'areaConfirmedAmount'],
  ['categoryConfirmedQty', 'categoryConfirmedAmount'],
] as const;

type AmountField = (typeof SALES_PLAN_EXPORT_AMOUNT_PAIRS)[number][number];
export type SalesPlanExportAmounts = Record<AmountField, string | null>;

/** Export each node's own values, never a fallback from another approval node. */
export const aggregateSalesPlanExportAmounts = (
  row: Pick<GeaSalesPlanListItem, 'versionId' | 'skuCount'>,
  skus: readonly GeaSalesPlanSku[]
): SalesPlanExportAmounts => {
  if (
    !Number.isSafeInteger(row.skuCount) ||
    row.skuCount < 0 ||
    skus.length !== row.skuCount ||
    skus.some((sku) => sku.versionId !== row.versionId || !sku.id?.trim() || !sku.skuCode?.trim()) ||
    new Set(skus.map((sku) => sku.id)).size !== skus.length ||
    new Set(skus.map((sku) => sku.skuCode)).size !== skus.length
  ) {
    throw new Error('Incomplete or mismatched sales-plan export SKUs');
  }
  const totals = {} as SalesPlanExportAmounts;
  for (const [quantity, amount] of SALES_PLAN_EXPORT_AMOUNT_PAIRS) {
    if (quantity !== 'qty' && skus.every((sku) => sku[quantity] == null && sku[amount] == null)) {
      totals[quantity] = null;
      totals[amount] = null;
      continue;
    }
    if (
      skus.some((sku) =>
        [quantity, amount].some((field) => typeof sku[field] !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(sku[field]))
      )
    ) {
      throw new Error('Incomplete or invalid sales-plan node amounts');
    }
    totals[quantity] = addExactDecimals(skus.map((sku) => sku[quantity]!));
    totals[amount] = addExactDecimals(skus.map((sku) => sku[amount]!));
  }
  return totals;
};
