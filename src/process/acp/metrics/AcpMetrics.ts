// src/process/acp/metrics/AcpMetrics.ts

import type { AcpErrorCode } from '@process/acp/errors/AcpError';

export type MetricsSnapshot = {
  entries: Array<{
    backend: string;
    metric: string;
    value: number;
    timestamp: number;
  }>;
};

export type AcpMetrics = {
  recordSpawnLatency(backend: string, ms: number): void;
  recordInitLatency(backend: string, ms: number): void;
  recordFirstTokenLatency(backend: string, ms: number): void;
  recordError(backend: string, code: AcpErrorCode): void;
  recordResumeResult(backend: string, success: boolean): void;
  snapshot(): MetricsSnapshot;
};

export const noopMetrics: AcpMetrics = {
  recordSpawnLatency() {},
  recordInitLatency() {},
  recordFirstTokenLatency() {},
  recordError() {},
  recordResumeResult() {},
  snapshot() {
    return { entries: [] };
  },
};
