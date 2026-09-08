/** Test-only simulation. These names are not a published GEA or DMS API contract. */
export type MockDmsCommand = {
  idempotencyKey: string;
  planId: string;
  versionId: string;
  quantity: string;
  amount: string;
};

export type MockDmsResult = {
  simulated: true;
  status: 'processing' | 'succeeded' | 'failed' | 'indeterminate';
  command: MockDmsCommand;
  receiptId?: string;
};

export const createSalesPlanDmsMock = () => {
  const attempts = new Map<string, { result: MockDmsResult; accepted: boolean; settled: boolean }>();
  let deliveries = 0;
  const read = (key: string) => {
    const attempt = attempts.get(key);
    if (!attempt) throw new Error('Unknown mock DMS attempt');
    return attempt;
  };
  return {
    submit(command: MockDmsCommand): MockDmsResult {
      if (
        !command.idempotencyKey ||
        !command.planId ||
        !command.versionId ||
        !/^-?\d+(?:\.\d+)?$/.test(command.quantity) ||
        !/^-?\d+(?:\.\d+)?$/.test(command.amount)
      )
        throw new Error('Invalid mock DMS command');
      const previous = attempts.get(command.idempotencyKey);
      if (previous) {
        // A modification can retain its business version while changing the payload.
        if (
          Object.keys(previous.result.command).some(
            (field) => previous.result.command[field as keyof MockDmsCommand] !== command[field as keyof MockDmsCommand]
          )
        )
          throw new Error('Mock DMS idempotency conflict');
        return structuredClone(previous.result);
      }
      const result: MockDmsResult = { simulated: true, status: 'processing', command: { ...command } };
      attempts.set(command.idempotencyKey, { result, accepted: false, settled: false });
      return structuredClone(result);
    },
    settle(key: string, outcome: 'success' | 'rejected' | 'response-lost'): MockDmsResult {
      const attempt = read(key);
      if (attempt.settled) return structuredClone(attempt.result);
      attempt.settled = true;
      attempt.accepted = outcome !== 'rejected';
      if (attempt.accepted) deliveries++;
      attempt.result.status = outcome === 'success' ? 'succeeded' : outcome === 'rejected' ? 'failed' : 'indeterminate';
      if (outcome === 'success') attempt.result.receiptId = `mock-dms:${key}`;
      return structuredClone(attempt.result);
    },
    reconcile(key: string): MockDmsResult {
      const attempt = read(key);
      if (attempt.result.status === 'indeterminate' && attempt.accepted) {
        attempt.result.status = 'succeeded';
        attempt.result.receiptId = `mock-dms:${key}`;
      }
      return structuredClone(attempt.result);
    },
    get deliveryCount() {
      return deliveries;
    },
  };
};

export type MockDmsScheduledJob = {
  command: MockDmsCommand;
  dueAt: number;
  result?: MockDmsResult;
};

/** Explicit test-clock jobs only: no production timer, trigger policy or network. */
export const createSalesPlanDmsScheduleMock = (
  transport: ReturnType<typeof createSalesPlanDmsMock>,
  restored: MockDmsScheduledJob[] = []
) => {
  const jobs = new Map(restored.map((job) => [job.command.idempotencyKey, structuredClone(job)]));
  return {
    enqueue(command: MockDmsCommand, dueAt: number) {
      if (!Number.isFinite(dueAt)) throw new Error('Invalid mock due time');
      const previous = jobs.get(command.idempotencyKey);
      if (previous) {
        if (JSON.stringify(previous.command) !== JSON.stringify(command) || previous.dueAt !== dueAt)
          throw new Error('Mock schedule idempotency conflict');
        return;
      }
      jobs.set(command.idempotencyKey, { command: structuredClone(command), dueAt });
    },
    tick(
      now: number,
      authorized: (command: MockDmsCommand) => boolean,
      outcome: 'success' | 'rejected' | 'response-lost'
    ) {
      const changed: MockDmsResult[] = [];
      for (const job of jobs.values()) {
        if (job.dueAt > now || job.result?.status === 'succeeded' || job.result?.status === 'failed') continue;
        if (job.result?.status === 'indeterminate') {
          job.result = transport.reconcile(job.command.idempotencyKey);
        } else if (!authorized(structuredClone(job.command))) {
          job.result = { simulated: true, status: 'failed', command: structuredClone(job.command) };
        } else {
          transport.submit(job.command);
          job.result = transport.settle(job.command.idempotencyKey, outcome);
        }
        changed.push(structuredClone(job.result));
      }
      return changed;
    },
    snapshot: () => structuredClone([...jobs.values()]),
  };
};
