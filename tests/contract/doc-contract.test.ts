/**
 * Contract tests for aionui-doc Rust crate.
 *
 * Tests verify that the Rust excelToJson produces equivalent results
 * to the TypeScript xlsx-republish implementation for the same inputs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx-republish';
import { excelToJson } from '@aionui/native';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-doc-contract-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

/**
 * Create a test xlsx file and return its path.
 * Uses XLSX.write to create a buffer, then writes it with Node.js fs.
 */
function createXlsx(
  sheets: Array<{ name: string; data: any[][] }>,
  fileName = 'test.xlsx',
): string {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filePath = path.join(tmpDir, fileName);
  require('fs').writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Read an xlsx file using TS xlsx-republish (baseline).
 */
function tsReadExcel(filePath: string) {
  const buffer = require('fs').readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((name: string) => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    return { name, data };
  });
}

// ============================================================================
// Basic cell data
// ============================================================================

describe('excelToJson — basic data', () => {
  it('reads single sheet with string data', () => {
    const filePath = createXlsx([
      {
        name: 'Sheet1',
        data: [
          ['Name', 'City'],
          ['Alice', 'Berlin'],
          ['Bob', 'Tokyo'],
        ],
      },
    ]);

    const rust = excelToJson(filePath);
    const ts = tsReadExcel(filePath);

    expect(rust.sheets.length).toBe(1);
    expect(rust.sheets[0].name).toBe('Sheet1');
    expect(rust.sheets[0].data.length).toBe(ts[0].data.length);

    // Compare each cell
    for (let r = 0; r < ts[0].data.length; r++) {
      for (let c = 0; c < ts[0].data[r].length; c++) {
        expect(rust.sheets[0].data[r][c]).toBe(ts[0].data[r][c]);
      }
    }
  });

  it('reads multiple sheets', () => {
    const filePath = createXlsx([
      { name: 'Sales', data: [['Q1', 100], ['Q2', 200]] },
      { name: 'Costs', data: [['Rent', 500], ['Staff', 1000]] },
      { name: 'Summary', data: [['Total', 1800]] },
    ]);

    const rust = excelToJson(filePath);
    expect(rust.sheets.length).toBe(3);
    expect(rust.sheets[0].name).toBe('Sales');
    expect(rust.sheets[1].name).toBe('Costs');
    expect(rust.sheets[2].name).toBe('Summary');
  });

  it('handles numeric types correctly', () => {
    const filePath = createXlsx([
      {
        name: 'Types',
        data: [
          ['Integer', 42],
          ['Float', 3.14],
          ['Negative', -100],
          ['Zero', 0],
          ['Large', 1000000],
        ],
      },
    ]);

    const rust = excelToJson(filePath);
    const ts = tsReadExcel(filePath);

    for (let r = 0; r < ts[0].data.length; r++) {
      expect(rust.sheets[0].data[r][0]).toBe(ts[0].data[r][0]); // label
      expect(rust.sheets[0].data[r][1]).toBeCloseTo(ts[0].data[r][1], 10); // number
    }
  });

  it('handles boolean values', () => {
    const filePath = createXlsx([
      {
        name: 'Booleans',
        data: [
          ['Flag', true],
          ['Flag', false],
        ],
      },
    ]);

    const rust = excelToJson(filePath);
    expect(rust.sheets[0].data[0][1]).toBe(true);
    expect(rust.sheets[0].data[1][1]).toBe(false);
  });

  it('handles empty cells as null', () => {
    const filePath = createXlsx([
      {
        name: 'Sparse',
        data: [
          ['A', null, 'C'],
          [null, 'B', null],
        ],
      },
    ]);

    const rust = excelToJson(filePath);
    // Empty cells may be null or missing at end of row
    expect(rust.sheets[0].data[0][0]).toBe('A');
    expect(rust.sheets[0].data[0][2]).toBe('C');
  });

  it('handles empty sheet', () => {
    const filePath = createXlsx([{ name: 'Empty', data: [] }]);

    const rust = excelToJson(filePath);
    expect(rust.sheets.length).toBe(1);
    expect(rust.sheets[0].name).toBe('Empty');
    expect(rust.sheets[0].data.length).toBe(0);
  });
});

// ============================================================================
// Large workbook
// ============================================================================

describe('excelToJson — large workbook', () => {
  it('reads 1000 rows x 10 columns without data loss', () => {
    const rows: any[][] = [];
    rows.push(Array.from({ length: 10 }, (_, c) => `Col${c}`));
    for (let r = 1; r <= 1000; r++) {
      rows.push(Array.from({ length: 10 }, (_, c) => r * 10 + c));
    }

    const filePath = createXlsx([{ name: 'Large', data: rows }]);

    const rust = excelToJson(filePath);
    expect(rust.sheets[0].data.length).toBe(1001); // header + 1000 rows

    // Spot check first, middle, last rows
    expect(rust.sheets[0].data[0][0]).toBe('Col0');
    expect(rust.sheets[0].data[500][0]).toBe(5000);
    expect(rust.sheets[0].data[1000][9]).toBe(10009);
  });
});

// ============================================================================
// Merge cells
// ============================================================================

describe('excelToJson — merge cells', () => {
  it('extracts merge ranges from xlsx', () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ['Merged Header', '', '', ''],
      ['A', 'B', 'C', 'D'],
      ['1', '2', '3', '4'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Merge A1:D1
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'MergeTest');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filePath = path.join(tmpDir, 'merge.xlsx');
    require('fs').writeFileSync(filePath, buffer);

    const rust = excelToJson(filePath);
    expect(rust.sheets[0].merges.length).toBe(1);
    expect(rust.sheets[0].merges[0].s.r).toBe(0);
    expect(rust.sheets[0].merges[0].s.c).toBe(0);
    expect(rust.sheets[0].merges[0].e.r).toBe(0);
    expect(rust.sheets[0].merges[0].e.c).toBe(3);
  });
});

// ============================================================================
// Error handling
// ============================================================================

describe('excelToJson — error handling', () => {
  it('throws on non-existent file', () => {
    expect(() => excelToJson('/nonexistent/file.xlsx')).toThrow();
  });

  it('throws on invalid file', async () => {
    const filePath = path.join(tmpDir, 'invalid.xlsx');
    await fsp.writeFile(filePath, 'this is not an excel file');
    expect(() => excelToJson(filePath)).toThrow();
  });
});

// ============================================================================
// Images (structural test — no actual images in programmatic xlsx)
// ============================================================================

describe('excelToJson — images', () => {
  it('returns empty images array for xlsx without images', () => {
    const filePath = createXlsx([{ name: 'NoImages', data: [['hello']] }]);
    const rust = excelToJson(filePath);
    expect(rust.sheets[0].images).toEqual([]);
  });
});
