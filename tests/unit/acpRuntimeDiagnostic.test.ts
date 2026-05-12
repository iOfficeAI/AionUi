/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseRuntimeDiagnosticStderr } from '../../src/process/agent/acp/AcpConnection';

describe('parseRuntimeDiagnosticStderr', () => {
  it('formats Codex ACP reconnect stream errors for the conversation UI', () => {
    const stderr =
      '2026-05-12T05:32:35.768647Z ERROR codex_acp::thread: Handled error during turn: ' +
      'Reconnecting... 4/5 Some(ResponseStreamDisconnected { http_status_code: Some(503) }) ' +
      'Some("unexpected status 503 Service Unavailable: Service temporarily unavailable, ' +
      'url: http://143.198.115.0:8080/v1/responses, request id: a4df1d9f-6ad6-469c-900f-c29798b2eb9d")';

    expect(parseRuntimeDiagnosticStderr(stderr)).toEqual({
      message: [
        'Reconnecting... 4/5 · 503 Service Unavailable: Service temporarily unavailable',
        '',
        'URL: http://143.198.115.0:8080/v1/responses',
        'Request ID: a4df1d9f-6ad6-469c-900f-c29798b2eb9d',
      ].join('\n'),
    });
  });

  it('ignores unrelated stderr', () => {
    expect(parseRuntimeDiagnosticStderr('debug: loaded config')).toBeNull();
  });

  it('uses the latest reconnect attempt when stderr tail contains prior attempts', () => {
    const stderr = [
      'Handled error during turn: Reconnecting... 1/5 Some(ResponseStreamDisconnected { http_status_code: Some(503) }) Some("unexpected status 503 Service Unavailable: Service temporarily unavailable")',
      'Handled error during turn: Reconnecting... 2/5 Some(ResponseStreamDisconnected { http_status_code: Some(503) }) Some("unexpected status 503 Service Unavailable: Service temporarily unavailable")',
    ].join('\n');

    expect(parseRuntimeDiagnosticStderr(stderr)?.message).toBe(
      'Reconnecting... 2/5 · 503 Service Unavailable: Service temporarily unavailable'
    );
  });
});
