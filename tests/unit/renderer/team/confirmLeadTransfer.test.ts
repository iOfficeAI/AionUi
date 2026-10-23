import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { LeadTransferWaitError, leadTransferErrorMessageKey } from '@/renderer/pages/team/utils/confirmLeadTransfer';

const httpError = (status: number, code: string) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/teams/team-1/lead',
    status,
    body: { code, error: code },
  });

describe('leadTransferErrorMessageKey', () => {
  it('maps a claimed-but-unstarted turn to the wait message', () => {
    expect(leadTransferErrorMessageKey(new LeadTransferWaitError())).toBe('team.leadTransfer.busyNotStarted');
  });

  it('maps a busy member conflict to the busy message', () => {
    expect(leadTransferErrorMessageKey(httpError(409, 'TEAM_MEMBER_BUSY'))).toBe('team.leadTransfer.busy');
    expect(leadTransferErrorMessageKey(httpError(409, 'TEAM_LEAD_TRANSFER_BUSY'))).toBe('team.leadTransfer.busy');
  });

  it('maps a runtime-starting conflict to the starting message', () => {
    expect(leadTransferErrorMessageKey(httpError(409, 'TEAM_MEMBER_RUNTIME_STARTING'))).toBe(
      'team.leadTransfer.runtimeStarting'
    );
  });

  it('maps an unknown lead-transfer conflict code to the generic failure message', () => {
    expect(leadTransferErrorMessageKey(httpError(409, 'TEAM_SOMETHING_ELSE'))).toBe('team.leadTransfer.failed');
  });

  it('maps non-409 and plain errors to the generic failure message', () => {
    expect(leadTransferErrorMessageKey(httpError(500, 'TEAM_MEMBER_BUSY'))).toBe('team.leadTransfer.failed');
    expect(leadTransferErrorMessageKey(new Error('boom'))).toBe('team.leadTransfer.failed');
  });
});
