import type { ISqliteDriver } from './drivers/ISqliteDriver';
import { LEGACY_HANDOFF_COLUMNS } from './legacyHandoffContract';

type TableInfoRow = { name: string };

export type LegacyHandoffRepairResult = {
  repairedColumns: Array<{ table: string; column: string }>;
  skippedTables: string[];
};

function getColumns(db: ISqliteDriver, table: string): Set<string> | null {
  const rows = db.pragma(`table_info(${table})`) as TableInfoRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return new Set(rows.map((row) => row.name));
}

export function repairLegacyHandoffSchema(db: ISqliteDriver): LegacyHandoffRepairResult {
  const repairedColumns: LegacyHandoffRepairResult['repairedColumns'] = [];
  const skippedTables = new Set<string>();

  for (const entry of LEGACY_HANDOFF_COLUMNS) {
    const columns = getColumns(db, entry.table);
    if (!columns) {
      skippedTables.add(entry.table);
      continue;
    }
    if (columns.has(entry.column)) continue;

    db.exec(`ALTER TABLE ${entry.table} ADD COLUMN ${entry.column} ${entry.definition}`);
    repairedColumns.push({ table: entry.table, column: entry.column });
  }

  if (repairedColumns.length > 0) {
    console.info('[Legacy DB] repaired handoff schema columns', { repairedColumns });
  } else {
    console.info('[Legacy DB] handoff schema repair no-op');
  }

  return {
    repairedColumns,
    skippedTables: [...skippedTables],
  };
}
