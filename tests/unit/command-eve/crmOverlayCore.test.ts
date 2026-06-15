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
import { buildCrmOverlay, initializeCrmOverlay } from '@/process/commandEve/crmOverlayCore';

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
    expect(result.model?.policy.local_only).toBe(true);
  });
});
