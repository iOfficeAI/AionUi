import type { GeaSalesPlanDetail, GeaSalesPlanListItem, GeaSalesPlanSku } from '@/common/adapter/ipcBridge';
import { salesPlanSkusMatchVersion } from './salesPlanDetailModel';
import { salesPlanActionTargetStatus, salesPlanApprovalNodeForStatus } from './salesPlanActionModel';

export type SalesPlanUiAction = 'SAVE' | 'APPROVE' | 'REJECT';
export type SalesPlanUiAccess = { allowedActions: SalesPlanUiAction[]; nodeOrder: number };

const NODE_PERMISSION = ['sales-confirm', 'region-approve', 'province-approve', 'area-approve', 'category-approve'];

/** Role-granted permissions control UI affordances. GEA remains authoritative on submission. */
export const salesPlanAccessForRow = (
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status'>,
  detail: GeaSalesPlanDetail,
  permissionCodes: readonly string[] = []
): SalesPlanUiAccess | undefined => {
  if (
    detail.currentVersion.id !== row.versionId ||
    detail.currentVersion.planId !== row.planId ||
    !detail.currentVersion.effective ||
    detail.currentVersion.status !== row.status ||
    !salesPlanSkusMatchVersion(row.versionId, detail.skus)
  )
    return undefined;
  const nodeOrder = row.status === 10 ? 5 : salesPlanApprovalNodeForStatus(row.status);
  if (nodeOrder === undefined || !permissionCodes.includes(`sales-plan:plan:${NODE_PERMISSION[nodeOrder - 1]}`))
    return undefined;
  const allowedActions: SalesPlanUiAction[] = [];
  if (nodeOrder >= 2) allowedActions.push('SAVE');
  if (permissionCodes.includes('sales-plan:plan:approve')) {
    if (salesPlanActionTargetStatus('APPROVE', row.status) !== undefined) allowedActions.push('APPROVE');
    if (salesPlanActionTargetStatus('REJECT', row.status) !== undefined) allowedActions.push('REJECT');
  }
  return { allowedActions, nodeOrder };
};

/** Approval deltas use the upstream quantity in the existing GEA contract. */
export const salesPlanEditableQuantity = (sku: GeaSalesPlanSku, status: number): string | undefined => {
  const node = salesPlanApprovalNodeForStatus(status);
  const value =
    status === 10
      ? (sku.categoryConfirmedQty ?? sku.areaConfirmedQty)
      : node === 5
        ? sku.areaConfirmedQty
        : node === 4
          ? sku.provinceConfirmedQty
          : node === 3
            ? sku.regionConfirmedQty
            : sku.qty;
  return value === null || value === undefined ? undefined : String(value);
};
