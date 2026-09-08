import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  SalesPlanActionAttempt,
  SalesPlanActionError,
  classifySalesPlanActionError,
  salesPlanActionTargetStatus,
  salesPlanApprovalNodeForStatus,
  validateSalesPlanActionInput,
  type SalesPlanActionClient,
  type SalesPlanActionInput,
} from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/models/salesPlanActionModel';
import { describe, expect, it, vi } from 'vitest';

const input: SalesPlanActionInput = {
  planId: 'plan-1',
  versionId: 'version-1',
  request: { action: 'APPROVE', expectedStatus: 4, remark: '同意' },
};

const receipt = {
  planId: 'plan-1',
  versionId: 'version-1',
  fromStatus: 4,
  toStatus: 5,
  replayed: false,
  requestId: 'req',
  traceId: 'trace-1',
  auditId: 'audit-1',
};

describe('sales plan action model', () => {
  it('rejects any accidental remote SAVE before calling GEA', async () => {
    const invoke = vi.fn();
    const action = new SalesPlanActionAttempt({ action: { invoke } });
    for (const status of [5, 10]) {
      const save = { ...input, request: { action: 'SAVE', expectedStatus: status } } as unknown as SalesPlanActionInput;
      expect(salesPlanActionTargetStatus(save.request.action, status)).toBeUndefined();
      expect(() => action.submit(save)).toThrow(SalesPlanActionError);
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shares one in-flight action for double clicks and caches the authoritative receipt', async () => {
    let resolve!: (value: typeof receipt) => void;
    const invoke = vi.fn(
      () =>
        new Promise<typeof receipt>((resolvePromise) => {
          resolve = resolvePromise;
        })
    );
    const action = new SalesPlanActionAttempt(
      { action: { invoke } },
      vi.fn().mockReturnValueOnce('idem').mockReturnValueOnce('req')
    );

    const first = action.submit(input);
    const duplicate = action.submit(input);
    expect(duplicate).toBe(first);
    expect(invoke).toHaveBeenCalledTimes(1);
    resolve(receipt);
    await expect(first).resolves.toEqual(receipt);
    await expect(action.submit(input)).resolves.toEqual(receipt);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('retries an unknown result with the exact same idempotency and request IDs', async () => {
    const invoke = vi
      .fn<SalesPlanActionClient['action']['invoke']>()
      .mockRejectedValueOnce(new TypeError('connection reset after write'))
      .mockResolvedValueOnce({ ...receipt, replayed: true });
    const action = new SalesPlanActionAttempt(
      { action: { invoke } },
      vi.fn().mockReturnValueOnce('idem').mockReturnValueOnce('req')
    );

    await expect(action.submit(input)).rejects.toMatchObject({ kind: 'unavailable', retrySameIntent: true });
    await expect(action.retry()).resolves.toMatchObject({ replayed: true, auditId: 'audit-1' });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][0]).toEqual(invoke.mock.calls[0][0]);
    expect(invoke.mock.calls[0][0]).toMatchObject({
      versionId: 'version-1',
      idempotencyKey: 'gea-sales-plan-action:idem',
      requestId: 'req',
    });
  });

  it.each([
    [400, 'validation', false],
    [401, 'authentication', false],
    [403, 'permission', false],
    [409, 'conflict', false],
    [429, 'rateLimited', true],
    [503, 'unavailable', true],
  ] as const)('classifies HTTP %s as %s', (status, kind, retrySameIntent) => {
    const error = new BackendHttpError({ method: 'POST', path: '/actions', status, body: { code: 'TEST' } });
    expect(classifySalesPlanActionError(error)).toMatchObject({ kind, retrySameIntent });
  });

  it('rejects a mismatched receipt as unknown and permits only a same-intent retry', async () => {
    const invoke = vi
      .fn<SalesPlanActionClient['action']['invoke']>()
      .mockResolvedValueOnce({ ...receipt, versionId: 'other-version' })
      .mockResolvedValueOnce(receipt);
    const action = new SalesPlanActionAttempt(
      { action: { invoke } },
      vi.fn().mockReturnValueOnce('idem').mockReturnValueOnce('req')
    );

    await expect(action.submit(input)).rejects.toMatchObject({ kind: 'unavailable', retrySameIntent: true });
    await expect(action.retry()).resolves.toEqual(receipt);
    expect(invoke.mock.calls[1][0]).toEqual(invoke.mock.calls[0][0]);
  });

  it('rejects a receipt bound to another request and retries with the original command identity', async () => {
    const invoke = vi
      .fn<SalesPlanActionClient['action']['invoke']>()
      .mockResolvedValueOnce({ ...receipt, requestId: 'another-request' })
      .mockResolvedValueOnce(receipt);
    const action = new SalesPlanActionAttempt(
      { action: { invoke } },
      vi.fn().mockReturnValueOnce('idem').mockReturnValueOnce('req')
    );

    await expect(action.submit(input)).rejects.toMatchObject({ kind: 'unavailable', retrySameIntent: true });
    await expect(action.retry()).resolves.toEqual(receipt);
    expect(invoke.mock.calls[1][0]).toEqual(invoke.mock.calls[0][0]);
    expect(invoke.mock.calls[0][0]).toMatchObject({
      idempotencyKey: 'gea-sales-plan-action:idem',
      requestId: 'req',
    });
  });

  it('validates reject remarks and only contract-safe SKU deltas without numeric coercion', () => {
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: { action: 'REJECT', expectedStatus: 4, remark: '  ' },
      })
    ).toThrow(SalesPlanActionError);
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: { action: 'REJECT', expectedStatus: 5, remark: 'final node cannot reject' },
      })
    ).toThrow(SalesPlanActionError);
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: {
          action: 'APPROVE',
          expectedStatus: 4,
          adjustments: [{ skuCode: '9007199254740993', adjustQty: '+123456789012345.999' }],
        },
      })
    ).not.toThrow();
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: {
          action: 'APPROVE',
          expectedStatus: 4,
          adjustments: [
            { skuCode: '42', adjustQty: '1' },
            { skuCode: '42', adjustQty: '2' },
          ],
        },
      })
    ).toThrow(SalesPlanActionError);
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: {
          action: 'APPROVE',
          expectedStatus: 4,
          adjustments: [
            { skuCode: '42', adjustQty: '1' },
            { skuCode: ' 42 ', adjustQty: '2' },
          ],
        },
      })
    ).toThrow(SalesPlanActionError);
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: {
          action: 'APPROVE',
          expectedStatus: 4,
          adjustments: [{ skuCode: 'fixture-sku', adjustQty: '1' }],
        },
      })
    ).toThrow(SalesPlanActionError);
  });

  it.each([
    [1, 1, 2, 6],
    [7, 1, 2, 6],
    [2, 2, 3, 7],
    [8, 2, 3, 7],
    [3, 3, 4, 8],
    [9, 3, 4, 8],
    [4, 4, 5, 9],
  ])(
    'maps returned status %s to current node %s and preserves linear approve/reject targets',
    (status, node, approveTarget, rejectTarget) => {
      expect(salesPlanApprovalNodeForStatus(status)).toBe(node);
      expect(salesPlanActionTargetStatus('APPROVE', status)).toBe(approveTarget);
      expect(salesPlanActionTargetStatus('REJECT', status)).toBe(rejectTarget);
      expect(() =>
        validateSalesPlanActionInput({
          ...input,
          request: { action: 'APPROVE', expectedStatus: status },
        })
      ).not.toThrow();
    }
  );

  it('keeps submitter return status 6 outside the approval action contract', () => {
    const status = 6;
    expect(salesPlanApprovalNodeForStatus(status)).toBeUndefined();
    expect(salesPlanActionTargetStatus('APPROVE', status)).toBeUndefined();
    expect(salesPlanActionTargetStatus('REJECT', status)).toBeUndefined();
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: { action: 'APPROVE', expectedStatus: status },
      })
    ).toThrow(SalesPlanActionError);
  });

  it('supports category approval 5 to 10 and disallows adjustments at sales confirmation', () => {
    expect(salesPlanApprovalNodeForStatus(5)).toBe(5);
    expect(salesPlanActionTargetStatus('APPROVE', 5)).toBe(10);
    expect(salesPlanActionTargetStatus('REJECT', 5)).toBeUndefined();
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: { action: 'APPROVE', expectedStatus: 5, adjustments: [{ skuCode: '42', adjustQty: '1' }] },
      })
    ).not.toThrow();
    expect(salesPlanActionTargetStatus('APPROVE', 10)).toBeUndefined();
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: {
          action: 'APPROVE',
          expectedStatus: 1,
          adjustments: [{ skuCode: '42', adjustQty: '1' }],
        },
      })
    ).toThrow(SalesPlanActionError);
    expect(() =>
      validateSalesPlanActionInput({
        ...input,
        request: {
          action: 'APPROVE',
          expectedStatus: 2,
          adjustments: [{ skuCode: '42', adjustQty: '1' }],
        },
      })
    ).not.toThrow();
  });
});
