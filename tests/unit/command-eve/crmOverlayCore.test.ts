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
    expect(result.data_boundary_checked).toBe(true);
    expect(result.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_draft_deal_create',
      status: 'local-only-pass',
      data_class: 'S2',
      human_gate: 'HG-4',
      provider_execution_allowed: false,
      subprocess_spawned: false,
      raw_text_stored: false,
    });
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
      data_boundary_checked: true,
      data_boundary_receipt: expect.objectContaining({
        version: 'command-eve-crm-nl5-local-receipt/v0',
        action: 'crm_draft_deal_create',
        status: 'local-only-pass',
      }),
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
    expect(result.data_boundary_checked).toBe(true);
    expect(result.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_draft_deal_stage_local',
      status: 'local-only-pass',
      data_class: 'S2',
      human_gate: 'HG-4',
      provider_execution_allowed: false,
      subprocess_spawned: false,
      raw_text_stored: false,
    });
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
      data_boundary_checked: true,
      data_boundary_receipt: expect.objectContaining({
        version: 'command-eve-crm-nl5-local-receipt/v0',
        action: 'crm_draft_deal_stage_local',
        status: 'local-only-pass',
      }),
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
    expect(result.data_boundary_checked).toBe(true);
    expect(result.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_consent_capture_local',
      status: 'local-only-pass',
      data_class: 'S2',
      human_gate: 'HG-4',
      provider_execution_allowed: false,
      subprocess_spawned: false,
      raw_text_stored: false,
    });
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
      data_boundary_checked: true,
      data_boundary_receipt: expect.objectContaining({
        version: 'command-eve-crm-nl5-local-receipt/v0',
        action: 'crm_consent_capture_local',
        status: 'local-only-pass',
      }),
    });
  });

  it('stages sanitized, length-capped draft labels when draftInput is supplied', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T09:00:00.000Z'),
    });

    const longName = 'A'.repeat(300);
    const longCompany = 'B'.repeat(200);
    const result = createCrmDraftDeal({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T09:01:00.000Z'),
      draftInput: {
        companyDisplayName: longCompany,
        contactDisplayName: 'Ada\tLovelace\n',
        contactRoleTitle: 'Head of Sales',
        dealLabel: 'Pilot Q3',
        notes: longName,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('CRM_DRAFT_DEAL_CREATED_LOCAL_ONLY');

    // Governance unchanged with real labels present.
    expect(result.data_boundary_checked).toBe(true);
    expect(result.data_boundary_receipt).toMatchObject({
      version: 'command-eve-crm-nl5-local-receipt/v0',
      action: 'crm_draft_deal_create',
      status: 'local-only-pass',
      data_class: 'S2',
      human_gate: 'HG-4',
      provider_execution_allowed: false,
      subprocess_spawned: false,
      raw_text_stored: false,
    });
    expect(result.model?.recent_deals[0]).toMatchObject({
      stage: 'draft',
      allowed_actions: 'draft-only',
      consent_status: 'unknown',
      human_gate: 'HG-4',
      data_class: 'S2',
    });

    const dbPath = result.model?.db_path || '';
    const companyRows = readRows(dbPath, 'SELECT display_name, data_class FROM crm_companies ORDER BY company_id') as Array<{
      display_name: string;
      data_class: string;
    }>;
    // 200-char input capped to the 120 default maxLength.
    expect(companyRows).toEqual([{ display_name: 'B'.repeat(120), data_class: 'S2' }]);

    const contactRows = readRows(
      dbPath,
      'SELECT display_name, role_title, consent_status, data_class FROM crm_contacts ORDER BY contact_id'
    ) as Array<{ display_name: string; role_title: string; consent_status: string; data_class: string }>;
    // Control chars collapsed to single spaces, NUL stripped, trimmed.
    expect(contactRows).toEqual([
      { display_name: 'Ada Lovelace', role_title: 'Head of Sales', consent_status: 'unknown', data_class: 'S2' },
    ]);

    const dealRows = readRows(
      dbPath,
      'SELECT notes_ref, allowed_actions, consent_status, human_gate, data_class FROM crm_deals ORDER BY deal_id'
    ) as Array<{ notes_ref: string; allowed_actions: string; consent_status: string; human_gate: string; data_class: string }>;
    expect(dealRows).toEqual([
      {
        notes_ref: 'Pilot Q3',
        allowed_actions: 'draft-only',
        consent_status: 'unknown',
        human_gate: 'HG-4',
        data_class: 'S2',
      },
    ]);

    // notes is length-capped at 240 — stored on the contact, never raw in telemetry.
    const contactNotes = readRows(dbPath, 'SELECT notes_ref FROM crm_contacts ORDER BY contact_id') as Array<{
      notes_ref: string;
    }>;
    expect(contactNotes[0].notes_ref.length).toBe(240);

    // Telemetry is length-only: no raw label text in the audit payload.
    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents[1].event_type).toBe('crm.draft_deal_created');
    expect(auditEvents[1].payload).toMatchObject({
      company_label_length: 120,
      contact_label_length: 'Ada Lovelace'.length,
      contact_role_label_length: 'Head of Sales'.length,
      deal_label_length: 'Pilot Q3'.length,
      notes_length: 240,
      local_only: true,
      consent_status: 'unknown',
      allowed_actions: 'draft-only',
      human_gate: 'HG-4',
      data_class: 'S2',
    });
    const payloadJson = JSON.stringify(auditEvents[1].payload);
    expect(payloadJson).not.toContain(longCompany);
    expect(payloadJson).not.toContain('Ada Lovelace');
    expect(payloadJson).not.toContain('Pilot Q3');
    expect(payloadJson).not.toContain(longName);
  });

  it('falls back to placeholder labels when draftInput is omitted (existing callers unchanged)', () => {
    const root = makeRoot();
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    initializeCrmOverlay({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T09:10:00.000Z'),
    });

    const result = createCrmDraftDeal({
      userDataPath: root,
      eventLedgerPath,
      now: () => new Date('2026-06-15T09:11:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.reason_code).toBe('CRM_DRAFT_DEAL_CREATED_LOCAL_ONLY');
    expect(result.data_boundary_receipt).toMatchObject({
      data_class: 'S2',
      human_gate: 'HG-4',
      provider_execution_allowed: false,
      subprocess_spawned: false,
      raw_text_stored: false,
    });

    const dbPath = result.model?.db_path || '';
    const companyRows = readRows(dbPath, 'SELECT display_name FROM crm_companies ORDER BY company_id');
    expect(companyRows).toEqual([{ display_name: 'Draft Company' }]);
    const contactRows = readRows(dbPath, 'SELECT display_name, role_title, notes_ref FROM crm_contacts ORDER BY contact_id');
    expect(contactRows).toEqual([
      { display_name: 'Draft Contact', role_title: 'Decision Maker', notes_ref: 'local-draft-only' },
    ]);
    const dealRows = readRows(
      dbPath,
      'SELECT notes_ref, allowed_actions, consent_status, human_gate, data_class FROM crm_deals ORDER BY deal_id'
    );
    expect(dealRows).toEqual([
      {
        notes_ref: 'local-draft-only',
        allowed_actions: 'draft-only',
        consent_status: 'unknown',
        human_gate: 'HG-4',
        data_class: 'S2',
      },
    ]);
  });
});
