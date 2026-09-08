import { describe, expect, it } from 'vitest';
import { createSalesPlanDmsMock, createSalesPlanDmsScheduleMock } from '../../fixtures/salesPlanDms';

const command = {
  idempotencyKey: 'attempt-1',
  planId: 'plan-1',
  versionId: 'version-1',
  quantity: '5',
  amount: '100.01',
};

describe('test-only sales-plan DMS simulation', () => {
  it('keeps processing separate from a successful mock receipt', () => {
    const mock = createSalesPlanDmsMock();
    expect(mock.submit(command)).toMatchObject({ simulated: true, status: 'processing' });
    expect(mock.deliveryCount).toBe(0);
    expect(mock.settle(command.idempotencyKey, 'success')).toMatchObject({
      status: 'succeeded',
      receiptId: 'mock-dms:attempt-1',
      command,
    });
    expect(mock.deliveryCount).toBe(1);
  });

  it('does not deliver explicitly rejected requests', () => {
    const mock = createSalesPlanDmsMock();
    mock.submit(command);
    expect(mock.settle(command.idempotencyKey, 'rejected')).toMatchObject({ status: 'failed' });
    expect(mock.deliveryCount).toBe(0);
  });

  it('reconciles a lost response without redelivering an indeterminate request', () => {
    const mock = createSalesPlanDmsMock();
    mock.submit(command);
    expect(mock.settle(command.idempotencyKey, 'response-lost').status).toBe('indeterminate');
    expect(mock.submit(command).status).toBe('indeterminate');
    expect(mock.settle(command.idempotencyKey, 'success').status).toBe('indeterminate');
    expect(mock.reconcile(command.idempotencyKey)).toMatchObject({
      status: 'succeeded',
      receiptId: 'mock-dms:attempt-1',
    });
    expect(mock.submit(command).status).toBe('succeeded');
    expect(mock.deliveryCount).toBe(1);
  });

  it('rejects changed content under the same key even when no new business version is created', () => {
    const mock = createSalesPlanDmsMock();
    const result = mock.submit(command);
    result.command.amount = '0';
    expect(mock.submit(command).command.amount).toBe('100.01');
    expect(() => mock.submit({ ...command, amount: '200' })).toThrow('idempotency conflict');
    expect(mock.submit({ ...command, idempotencyKey: 'attempt-2', amount: '200' }).command.versionId).toBe(
      command.versionId
    );
  });
});

describe('explicit test-clock DMS scheduling and recovery', () => {
  it('recovers a missed due time after restart and reconciles a lost response without delivery duplication', () => {
    const transport = createSalesPlanDmsMock();
    const scheduler = createSalesPlanDmsScheduleMock(transport);
    scheduler.enqueue(command, 100);
    expect(scheduler.tick(99, () => true, 'response-lost')).toEqual([]);
    const restarted = createSalesPlanDmsScheduleMock(transport, scheduler.snapshot());
    expect(restarted.tick(200, () => true, 'response-lost')[0].status).toBe('indeterminate');
    expect(transport.deliveryCount).toBe(1);
    const recovery = createSalesPlanDmsScheduleMock(transport, restarted.snapshot());
    expect(recovery.tick(300, () => true, 'success')[0].status).toBe('succeeded');
    expect(recovery.tick(300, () => true, 'success')).toEqual([]);
    expect(transport.deliveryCount).toBe(1);
  });

  it('rechecks authority at execution and never overwrites changed content under a scheduled key', () => {
    const transport = createSalesPlanDmsMock();
    const scheduler = createSalesPlanDmsScheduleMock(transport);
    scheduler.enqueue(command, 100);
    expect(() => scheduler.enqueue({ ...command, quantity: '6' }, 100)).toThrow('conflict');
    expect(scheduler.tick(200, () => false, 'success')[0].status).toBe('failed');
    expect(transport.deliveryCount).toBe(0);
    expect(scheduler.tick(300, () => true, 'success')).toEqual([]);
  });
});
