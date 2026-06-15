/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildCrmOverlay,
  captureCrmConsentLocal,
  changeCrmDealStageLocal,
  createCrmDraftDeal,
  initializeCrmOverlay,
} from '@/process/commandEve/crmOverlayCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-crm-overlay-test-'));
  tempRoots.push(root);
  return root;
};

const readRows = (dbPath: string, sql: string): unknown[] => {
  const stdout = execFileSync(
    'python3',
    [
      '-c',
      `
import json
import sqlite3
import sys
conn = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
try:
    rows = [dict(row) for row in conn.execute(sys.argv[2]).fetchall()]
    print(json.dumps(rows))
finally:
    conn.close()
`,
      dbPath,
      sql,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(stdout) as unknown[];
};

const readAuditEvents = (eventLedgerPath: string): Array<Record<string, unknown>> =>
  fs
    .readFileSync(eventLedgerPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Command EVE CRM overlay core', () => {
  it('blocks loudly before the local CRM overlay schema exists', () => {
    const root = makeRoot();
    const result = buildCrmOverlay({
      userDataPath: root,
      now: () => new Date('2026-06-15T08:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('CRM_OVERLAY_NOT_INITIALIZED');
    expect(result.model?.initialized).toBe(false);
    expect(result.model?.policy.local_only).toBe(true);
    expect(result.model?.policy.bulk_import_enabled).toBe(false);
    expect(result.model?.policy.outreach_enabled).toBe(false);
    expect(result.model?.counts.deals).toBe(0);
  });

  it('initializes only the local CRM ledger schema and writes receipts', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    const result = initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:10:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('CRM_OVERLAY_INITIALIZED_LOCAL_ONLY');
    expect(result.audit_event_id).toContain('command-eve-crm-overlay-initialized');
    expect(result.audit_event_path).toBe(eventLedgerPath);
    expect(result.model?.initialized).toBe(true);
    expect(result.model?.policy.hosted_sync_enabled).toBe(false);
    expect(result.model?.policy.plane_sync_enabled).toBe(false);
    expect(result.model?.policy.enrichment_enabled).toBe(false);
    expect(result.model?.policy.customer_write_requires_humangate).toBe('HG-4');

    const dbPath = result.model?.db_path || '';
    const tables = readRows(dbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    expect(tables).toEqual([
      { name: 'crm_companies' },
      { name: 'crm_contacts' },
      { name: 'crm_deals' },
      { name: 'crm_events' },
      { name: 'sqlite_sequence' },
    ]);
    const crmEvents = readRows(dbPath, 'SELECT kind FROM crm_events ORDER BY id');
    expect(crmEvents).toEqual([{ kind: 'crm_overlay_initialized' }]);

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].event_type).toBe('crm.overlay_initialized');
    expect(auditEvents[0].payload).toMatchObject({
      local_only: true,
      plane_sync_enabled: false,
      hosted_sync_enabled: false,
      outreach_enabled: false,
      crm_data_class_default: 'S2',
      human_gate: 'HG-4',
    });
  });

  it('reads existing local CRM counts without mutating external systems', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    const initialized = initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:20:00.000Z'),
    });
    const dbPath = initialized.model?.db_path || '';
    execFileSync(
      'python3',
      [
        '-c',
        `
import sqlite3
import sys
conn = sqlite3.connect(sys.argv[1])
try:
    conn.execute("INSERT INTO crm_companies (company_id, display_name) VALUES ('c_1', 'Example GmbH')")
    conn.execute("INSERT INTO crm_contacts (contact_id, display_name, company_id) VALUES ('p_1', 'Ada Example', 'c_1')")
    conn.execute("INSERT INTO crm_deals (deal_id, pipeline_board_slug, company_id) VALUES ('d_1', 'sales', 'c_1')")
    conn.commit()
finally:
    conn.close()
`,
        dbPath,
      ],
      { encoding: 'utf8' }
    );

    const result = buildCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:21:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.reason_code).toBe('CRM_OVERLAY_READY_LOCAL_ONLY');
    expect(result.model?.counts).toMatchObject({
      companies: 1,
      contacts: 1,
      deals: 1,
      audit_events: 1,
    });
    expect(result.model?.recent_deals).toEqual([
      {
        deal_id: 'd_1',
        company_id: 'c_1',
        stage: 'draft',
        allowed_actions: 'draft-only',
        consent_status: 'unknown',
        human_gate: 'HG-4',
        data_class: 'S2',
        last_activity_at: '',
      },
    ]);
    expect(result.model?.policy.local_only).toBe(true);
  });

  it('creates a local-only draft company, contact, deal and audit receipt', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:30:00.000Z'),
    });

    const result = createCrmDraftDeal({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:31:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('CRM_DRAFT_DEAL_CREATED_LOCAL_ONLY');
    expect(result.company_id).toContain('crm-company-');
    expect(result.contact_id).toContain('crm-contact-');
    expect(result.deal_id).toContain('crm-deal-');
    expect(result.model?.counts).toMatchObject({
      companies: 1,
      contacts: 1,
      deals: 1,
      audit_events: 2,
    });
    expect(result.model?.recent_deals).toHaveLength(1);
    expect(result.model?.recent_deals[0]).toMatchObject({
      deal_id: result.deal_id,
      company_id: result.company_id,
      stage: 'draft',
      allowed_actions: 'draft-only',
      consent_status: 'unknown',
      human_gate: 'HG-4',
      data_class: 'S2',
      last_activity_at: '2026-06-15T08:31:00.000Z',
    });

    const dbPath = result.model?.db_path || '';
    const dealRows = readRows(
      dbPath,
      'SELECT deal_id, stage, allowed_actions, consent_status, human_gate, data_class FROM crm_deals ORDER BY deal_id'
    );
    expect(dealRows).toEqual([
      {
        deal_id: result.deal_id,
        stage: 'draft',
        allowed_actions: 'draft-only',
        consent_status: 'unknown',
        human_gate: 'HG-4',
        data_class: 'S2',
      },
    ]);
    const crmEvents = readRows(dbPath, 'SELECT kind FROM crm_events ORDER BY id');
    expect(crmEvents).toEqual([{ kind: 'crm_overlay_initialized' }, { kind: 'crm_draft_deal_created' }]);

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[1].event_type).toBe('crm.draft_deal_created');
    expect(auditEvents[1].payload).toMatchObject({
      local_only: true,
      hosted_sync_enabled: false,
      outreach_enabled: false,
      consent_status: 'unknown',
      allowed_actions: 'draft-only',
      human_gate: 'HG-4',
    });
  });

  it('changes a local draft deal stage with local-only policy receipts', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:40:00.000Z'),
    });
    const draft = createCrmDraftDeal({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:41:00.000Z'),
    });

    const result = changeCrmDealStageLocal(
      {
        userDataPath: root,
        eventLedgerPath,
        now: () => new Date('2026-06-15T08:42:00.000Z'),
      },
      { dealId: draft.deal_id || '', targetStage: 'qualified' }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('CRM_STAGE_CHANGED_LOCAL_ONLY');
    expect(result.deal_id).toBe(draft.deal_id);
    expect(result.previous_stage).toBe('draft');
    expect(result.stage).toBe('qualified');
    expect(result.model?.recent_deals[0]).toMatchObject({
      deal_id: draft.deal_id,
      stage: 'qualified',
      allowed_actions: 'draft-only',
      consent_status: 'unknown',
      human_gate: 'HG-4',
      data_class: 'S2',
      last_activity_at: '2026-06-15T08:42:00.000Z',
    });

    const dbPath = result.model?.db_path || '';
    const dealRows = readRows(
      dbPath,
      'SELECT stage, allowed_actions, consent_status, human_gate, data_class, last_activity_at FROM crm_deals ORDER BY deal_id'
    );
    expect(dealRows).toEqual([
      {
        stage: 'qualified',
        allowed_actions: 'draft-only',
        consent_status: 'unknown',
        human_gate: 'HG-4',
        data_class: 'S2',
        last_activity_at: '2026-06-15T08:42:00.000Z',
      },
    ]);
    const crmEvents = readRows(dbPath, 'SELECT kind FROM crm_events ORDER BY id');
    expect(crmEvents).toEqual([
      { kind: 'crm_overlay_initialized' },
      { kind: 'crm_draft_deal_created' },
      { kind: 'crm_draft_deal_stage_changed' },
    ]);

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents[2].event_type).toBe('crm.draft_deal_stage_changed');
    expect(auditEvents[2].payload).toMatchObject({
      local_only: true,
      hosted_sync_enabled: false,
      outreach_enabled: false,
      subprocess_spawned: false,
      consent_status: 'unknown',
      allowed_actions: 'draft-only',
      human_gate: 'HG-4',
      stage: 'qualified',
    });
  });

  it('captures local CRM consent without sync, outreach or worker spawn', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:50:00.000Z'),
    });
    const draft = createCrmDraftDeal({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T08:51:00.000Z'),
    });

    const result = captureCrmConsentLocal(
      {
        userDataPath: root,
        eventLedgerPath,
        now: () => new Date('2026-06-15T08:52:00.000Z'),
      },
      { dealId: draft.deal_id || '' }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('CRM_CONSENT_CAPTURED_LOCAL_ONLY');
    expect(result.deal_id).toBe(draft.deal_id);
    expect(result.consent_status).toBe('captured-local');
    expect(result.allowed_actions).toBe('review-only');
    expect(result.model?.recent_deals[0]).toMatchObject({
      deal_id: draft.deal_id,
      stage: 'draft',
      allowed_actions: 'review-only',
      consent_status: 'captured-local',
      human_gate: 'HG-4',
      data_class: 'S2',
      last_activity_at: '2026-06-15T08:52:00.000Z',
    });

    const dbPath = result.model?.db_path || '';
    const dealRows = readRows(
      dbPath,
      'SELECT stage, allowed_actions, consent_status, human_gate, data_class, last_activity_at FROM crm_deals ORDER BY deal_id'
    );
    expect(dealRows).toEqual([
      {
        stage: 'draft',
        allowed_actions: 'review-only',
        consent_status: 'captured-local',
        human_gate: 'HG-4',
        data_class: 'S2',
        last_activity_at: '2026-06-15T08:52:00.000Z',
      },
    ]);
    const contactRows = readRows(
      dbPath,
      'SELECT consent_status, consent_basis, consent_source, last_verified FROM crm_contacts ORDER BY contact_id'
    );
    expect(contactRows).toEqual([
      {
        consent_status: 'captured-local',
        consent_basis: 'manual-founder-confirmation',
        consent_source: 'command-eve-local-ui',
        last_verified: '2026-06-15T08:52:00.000Z',
      },
    ]);
    const crmEvents = readRows(dbPath, 'SELECT kind FROM crm_events ORDER BY id');
    expect(crmEvents).toEqual([
      { kind: 'crm_overlay_initialized' },
      { kind: 'crm_draft_deal_created' },
      { kind: 'crm_consent_captured_local' },
    ]);

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents[2].event_type).toBe('crm.consent_captured_local');
    expect(auditEvents[2].payload).toMatchObject({
      local_only: true,
      hosted_sync_enabled: false,
      outreach_enabled: false,
      subprocess_spawned: false,
      consent_status: 'captured-local',
      consent_basis: 'manual-founder-confirmation',
      consent_source: 'command-eve-local-ui',
      allowed_actions: 'review-only',
      human_gate: 'HG-4',
      data_class: 'S2',
    });
  });
});
