/**
 * Benchmark: TS (xlsx-republish) vs Rust (aionui-doc) for Excel reading.
 *
 * Usage: npx tsx tests/bench/doc-bench.ts
 */
import { performance } from 'perf_hooks';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as XLSX from 'xlsx-republish';
import { excelToJson } from '@aionui/native';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-bench-'));

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function createXlsx(
  sheets: Array<{ name: string; data: any[][] }>,
  fileName: string,
): string {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function tsExcelToJson(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((name: string) => {
    const sheet = workbook.Sheets[name];
    return {
      name,
      data: XLSX.utils.sheet_to_json(sheet, { header: 1 }),
    };
  });
}

function bench(
  name: string,
  iterations: number,
  fn: () => void,
): { p50: number; p95: number; p99: number } {
  const times: number[] = [];

  // Warm up
  for (let i = 0; i < Math.min(10, iterations); i++) fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const p = (pct: number) => times[Math.floor(times.length * pct)] || 0;

  return { p50: p(0.5), p95: p(0.95), p99: p(0.99) };
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}us` : `${ms.toFixed(2)}ms`;
}

function printResult(
  label: string,
  ts: ReturnType<typeof bench>,
  rust: ReturnType<typeof bench>,
) {
  const speedup = (ts.p50 / rust.p50).toFixed(2);
  console.log(
    `  ${label.padEnd(30)} ` +
      `TS ${fmt(ts.p50).padStart(10)} | ` +
      `Rust ${fmt(rust.p50).padStart(10)} | ` +
      `${speedup}x`,
  );
}

// ---------------------------------------------------------------------------
// Test data generation
// ---------------------------------------------------------------------------

function createSmallFile(): string {
  return createXlsx(
    [{ name: 'Sheet1', data: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']] }],
    'small.xlsx',
  );
}

function create100RowFile(): string {
  const rows: any[][] = [['Col1', 'Col2', 'Col3', 'Col4', 'Col5']];
  for (let i = 0; i < 100; i++) {
    rows.push([`row${i}`, i, i * 1.5, i % 2 === 0, `val${i}`]);
  }
  return createXlsx([{ name: 'Data', data: rows }], 'medium.xlsx');
}

function create1000RowFile(): string {
  const rows: any[][] = [
    Array.from({ length: 20 }, (_, c) => `Header${c}`),
  ];
  for (let i = 0; i < 1000; i++) {
    rows.push(Array.from({ length: 20 }, (_, c) => i * 20 + c));
  }
  return createXlsx([{ name: 'Large', data: rows }], 'large.xlsx');
}

function create10kRowFile(): string {
  const rows: any[][] = [
    Array.from({ length: 10 }, (_, c) => `Col${c}`),
  ];
  for (let i = 0; i < 10000; i++) {
    rows.push(Array.from({ length: 10 }, (_, c) => `r${i}c${c}`));
  }
  return createXlsx([{ name: 'XL', data: rows }], 'xlarge.xlsx');
}

function createMultiSheetFile(): string {
  const sheets = [];
  for (let s = 0; s < 5; s++) {
    const rows: any[][] = [['A', 'B', 'C']];
    for (let r = 0; r < 200; r++) {
      rows.push([s * 1000 + r, `val${r}`, r * 0.5]);
    }
    sheets.push({ name: `Sheet${s + 1}`, data: rows });
  }
  return createXlsx(sheets, 'multi.xlsx');
}

// ---------------------------------------------------------------------------
// Run benchmarks
// ---------------------------------------------------------------------------

console.log('=== Document Converter Benchmark: TS (xlsx-republish) vs Rust (calamine) ===');
console.log(`Platform: ${os.platform()} ${os.arch()}`);
console.log(`CPU: ${os.cpus()[0].model}`);
console.log(`Node: ${process.version}`);
console.log('');

try {
  // Small file (3 rows, 3 cols)
  const smallFile = createSmallFile();
  const smallFileSize = fs.statSync(smallFile).size;
  console.log(`[Small file: ${smallFileSize} bytes, 3 rows x 3 cols]`);
  const tsSmall = bench('ts-small', 500, () => tsExcelToJson(smallFile));
  const rsSmall = bench('rs-small', 500, () => excelToJson(smallFile));
  printResult('Small (3x3)', tsSmall, rsSmall);

  // Medium file (100 rows, 5 cols)
  const medFile = create100RowFile();
  const medFileSize = fs.statSync(medFile).size;
  console.log(`\n[Medium file: ${medFileSize} bytes, 100 rows x 5 cols]`);
  const tsMed = bench('ts-med', 200, () => tsExcelToJson(medFile));
  const rsMed = bench('rs-med', 200, () => excelToJson(medFile));
  printResult('Medium (100x5)', tsMed, rsMed);

  // Large file (1000 rows, 20 cols)
  const largeFile = create1000RowFile();
  const largeFileSize = fs.statSync(largeFile).size;
  console.log(`\n[Large file: ${largeFileSize} bytes, 1000 rows x 20 cols]`);
  const tsLarge = bench('ts-large', 50, () => tsExcelToJson(largeFile));
  const rsLarge = bench('rs-large', 50, () => excelToJson(largeFile));
  printResult('Large (1000x20)', tsLarge, rsLarge);

  // XL file (10000 rows, 10 cols)
  const xlFile = create10kRowFile();
  const xlFileSize = fs.statSync(xlFile).size;
  console.log(`\n[XL file: ${xlFileSize} bytes, 10000 rows x 10 cols]`);
  const tsXl = bench('ts-xl', 10, () => tsExcelToJson(xlFile));
  const rsXl = bench('rs-xl', 10, () => excelToJson(xlFile));
  printResult('XL (10000x10)', tsXl, rsXl);

  // Multi-sheet (5 sheets, 200 rows each)
  const multiFile = createMultiSheetFile();
  const multiFileSize = fs.statSync(multiFile).size;
  console.log(`\n[Multi-sheet: ${multiFileSize} bytes, 5 sheets x 200 rows]`);
  const tsMulti = bench('ts-multi', 100, () => tsExcelToJson(multiFile));
  const rsMulti = bench('rs-multi', 100, () => excelToJson(multiFile));
  printResult('Multi-sheet (5x200)', tsMulti, rsMulti);

  console.log('\n=== Summary ===');
  console.log('Operation                        TS p50       Rust p50      Speedup');
  console.log('─'.repeat(70));
  printResult('Small (3x3)', tsSmall, rsSmall);
  printResult('Medium (100x5)', tsMed, rsMed);
  printResult('Large (1000x20)', tsLarge, rsLarge);
  printResult('XL (10000x10)', tsXl, rsXl);
  printResult('Multi-sheet (5x200)', tsMulti, rsMulti);

} finally {
  cleanup();
}
