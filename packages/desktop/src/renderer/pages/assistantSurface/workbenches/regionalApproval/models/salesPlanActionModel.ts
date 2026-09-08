import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  GeaSalesPlanActionParams,
  GeaSalesPlanActionReceipt,
  GeaSalesPlanActionRequest,
  GeaSalesPlanSku,
  GeaSalesPlanSkuAdjustment,
  GeaSalesPlanVersionSkuQuery,
} from '@/common/adapter/ipcBridge';

export type SalesPlanActionClient = {
  action: { invoke: (params: GeaSalesPlanActionParams) => Promise<GeaSalesPlanActionReceipt> };
  versionSkus?: { invoke: (query: GeaSalesPlanVersionSkuQuery) => Promise<GeaSalesPlanSku[]> };
};

export type SalesPlanActionInput = {
  planId: string;
  versionId: string;
  request: GeaSalesPlanActionRequest;
};

export type SalesPlanActionErrorKind =
  | 'validation'
  | 'authentication'
  | 'permission'
  | 'conflict'
  | 'rateLimited'
  | 'unavailable'
  | 'failed';

export class SalesPlanActionError extends Error {
  constructor(
    readonly kind: SalesPlanActionErrorKind,
    readonly retrySameIntent: boolean,
    readonly retryAfterMs?: number,
    options?: ErrorOptions
  ) {
    super(kind, options);
    this.name = 'SalesPlanActionError';
  }
}

const DECIMAL_PATTERN = /^[+-]?(\d+)(?:\.(\d{1,3}))?$/;
const POSITIVE_LONG_PATTERN = /^[1-9]\d*$/;
const MAX_SIGNED_LONG = BigInt('9223372036854775807');

export const salesPlanApprovalNodeForStatus = (status: number): number | undefined => {
  if (!Number.isInteger(status)) return undefined;
  return (
    {
      1: 1,
      7: 1,
      2: 2,
      8: 2,
      3: 3,
      9: 3,
      4: 4,
      5: 5,
    } as const
  )[status as 1 | 2 | 3 | 4 | 5 | 7 | 8 | 9];
};

export const salesPlanActionTargetStatus = (
  action: GeaSalesPlanActionRequest['action'],
  status: number
): number | undefined => {
  if (action !== 'APPROVE' && action !== 'REJECT') return undefined;
  const nodeOrder = salesPlanApprovalNodeForStatus(status);
  if (nodeOrder === undefined) return undefined;
  if (action === 'REJECT') return nodeOrder === 5 ? undefined : nodeOrder + 5;
  return nodeOrder === 5 ? 10 : nodeOrder + 1;
};

const isValidAdjustment = (adjustment: GeaSalesPlanSkuAdjustment): boolean => {
  const value = adjustment.adjustQty.trim();
  const decimal = value.match(DECIMAL_PATTERN);
  const skuCode = adjustment.skuCode;
  return Boolean(
    decimal &&
    decimal[1].replace(/^0+/, '').length <= 15 &&
    POSITIVE_LONG_PATTERN.test(skuCode) &&
    BigInt(skuCode) <= MAX_SIGNED_LONG
  );
};

export const validateSalesPlanActionInput = (input: SalesPlanActionInput): void => {
  const { request } = input;
  if (!input.planId.trim() || !input.versionId.trim()) throw new SalesPlanActionError('validation', false);
  if (request.action !== 'APPROVE' && request.action !== 'REJECT') throw new SalesPlanActionError('validation', false);
  const approvalNodeOrder = salesPlanApprovalNodeForStatus(request.expectedStatus);
  if (approvalNodeOrder === undefined) throw new SalesPlanActionError('validation', false);
  const remark = request.remark?.trim() ?? '';
  if (Array.from(remark).length > 1000) throw new SalesPlanActionError('validation', false);
  if (request.action === 'REJECT' && !remark) throw new SalesPlanActionError('validation', false);
  if (salesPlanActionTargetStatus(request.action, request.expectedStatus) === undefined) {
    throw new SalesPlanActionError('validation', false);
  }
  if (request.action === 'REJECT' && request.adjustments?.length) {
    throw new SalesPlanActionError('validation', false);
  }
  if (approvalNodeOrder === 1 && request.adjustments?.length) {
    throw new SalesPlanActionError('validation', false);
  }
  const skuCodes = new Set<string>();
  for (const adjustment of request.adjustments ?? []) {
    if (!isValidAdjustment(adjustment) || skuCodes.has(adjustment.skuCode)) {
      throw new SalesPlanActionError('validation', false);
    }
    skuCodes.add(adjustment.skuCode);
  }
};

const retryAfterMsFromDetails = (details: unknown): number | undefined => {
  if (!details || typeof details !== 'object') return undefined;
  const value = (details as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
};

export const classifySalesPlanActionError = (error: unknown): SalesPlanActionError => {
  if (error instanceof SalesPlanActionError) return error;
  if (isBackendHttpError(error)) {
    if (error.status === 400) return new SalesPlanActionError('validation', false, undefined, { cause: error });
    if (error.status === 401) return new SalesPlanActionError('authentication', false, undefined, { cause: error });
    if (error.status === 403) return new SalesPlanActionError('permission', false, undefined, { cause: error });
    if (error.status === 409) return new SalesPlanActionError('conflict', false, undefined, { cause: error });
    if (error.status === 429) {
      return new SalesPlanActionError('rateLimited', true, retryAfterMsFromDetails(error.details), { cause: error });
    }
    if (error.status >= 500) return new SalesPlanActionError('unavailable', true, undefined, { cause: error });
    return new SalesPlanActionError('failed', false, undefined, { cause: error });
  }
  if (error instanceof TypeError) return new SalesPlanActionError('unavailable', true, undefined, { cause: error });
  return new SalesPlanActionError('failed', false, undefined, { cause: error });
};

export const salesPlanActionReceiptMatches = (
  input: SalesPlanActionInput,
  requestId: string,
  receipt: GeaSalesPlanActionReceipt
): boolean =>
  receipt.planId === input.planId &&
  receipt.versionId === input.versionId &&
  receipt.fromStatus === input.request.expectedStatus &&
  receipt.toStatus === salesPlanActionTargetStatus(input.request.action, input.request.expectedStatus) &&
  receipt.requestId === requestId &&
  receipt.traceId.trim().length > 0 &&
  receipt.auditId.trim().length > 0;

const normalizedInput = (input: SalesPlanActionInput): SalesPlanActionInput => {
  const { remark, adjustments, ...request } = input.request;
  return {
    planId: input.planId,
    versionId: input.versionId,
    request: {
      ...request,
      ...(remark?.trim() ? { remark: remark.trim() } : {}),
      ...(adjustments?.length
        ? {
            adjustments: adjustments.map((adjustment) => ({
              skuCode: adjustment.skuCode,
              adjustQty: adjustment.adjustQty,
            })),
          }
        : {}),
    },
  };
};

export class SalesPlanActionAttempt {
  private command?: GeaSalesPlanActionParams;
  private input?: SalesPlanActionInput;
  private inFlight?: Promise<GeaSalesPlanActionReceipt>;
  private receipt?: GeaSalesPlanActionReceipt;
  private failure?: SalesPlanActionError;

  constructor(
    private readonly client: SalesPlanActionClient,
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {}

  submit(input: SalesPlanActionInput): Promise<GeaSalesPlanActionReceipt> {
    validateSalesPlanActionInput(input);
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.inFlight) return this.inFlight;
    if (this.command) return Promise.reject(this.failure ?? new SalesPlanActionError('failed', false));

    this.input = normalizedInput(input);
    this.command = {
      versionId: this.input.versionId,
      request: this.input.request,
      idempotencyKey: `gea-sales-plan-action:${this.createId()}`,
      requestId: this.createId(),
    };
    return this.invoke();
  }

  retry(): Promise<GeaSalesPlanActionReceipt> {
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.inFlight) return this.inFlight;
    if (!this.command || !this.failure?.retrySameIntent) {
      return Promise.reject(this.failure ?? new SalesPlanActionError('failed', false));
    }
    return this.invoke();
  }

  private invoke(): Promise<GeaSalesPlanActionReceipt> {
    const command = this.command;
    const input = this.input;
    if (!command || !input) return Promise.reject(new SalesPlanActionError('failed', false));
    this.failure = undefined;
    this.inFlight = this.client.action
      .invoke(command)
      .then((receipt) => {
        if (!salesPlanActionReceiptMatches(input, command.requestId, receipt)) {
          throw new SalesPlanActionError('unavailable', true);
        }
        this.receipt = receipt;
        return receipt;
      })
      .catch((error: unknown) => {
        const classified = classifySalesPlanActionError(error);
        this.failure = classified;
        throw classified;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }
}
