# Document Converter Module -- Rust Design

## 1. TypeScript Interface Analysis

**Source files:**

- `src/common/chat/document/DocumentConverter.ts` (markdown-centric converter)
- `src/process/services/conversionService.ts` (advanced conversion service)
- `src/process/bridge/documentBridge.ts` (IPC bridge)
- `src/common/types/conversion.ts` (shared types)

### 1.1 Live Functions (called through IPC bridge)

Only 3 functions have external callers, all via `documentBridge.ts`:

| TS Function      | Parameters        | Return Type                          | Sync/Async | Caller                   |
| ---------------- | ----------------- | ------------------------------------ | ---------- | ------------------------ |
| `wordToMarkdown` | `filePath: string` | `Promise<ConversionResult<string>>`  | async      | documentBridge (IPC)     |
| `excelToJson`    | `filePath: string` | `Promise<ConversionResult<ExcelWorkbookData>>` | async | documentBridge (IPC) |
| `pptToJson`      | `filePath: string` | `Promise<ConversionResult<PPTJsonData>>`       | async | documentBridge (IPC) |

### 1.2 Dead Code (zero external callers)

| Function/Class           | Location              | Notes                                      |
| ------------------------ | --------------------- | ------------------------------------------ |
| `DocumentConverter` class | DocumentConverter.ts  | Entire class unused; singleton never imported |
| `markdownToWord()`       | conversionService.ts  | Defined in ConversionServiceApi but never called |
| `jsonToExcel()`          | conversionService.ts  | Same                                       |
| `htmlToPdf()`            | conversionService.ts  | Uses Electron BrowserWindow; never called  |
| `markdownToPdf()`        | conversionService.ts  | Delegates to htmlToPdf; never called       |

### 1.3 npm Dependencies

| Package             | Used By                            | Status After Migration |
| ------------------- | ---------------------------------- | ---------------------- |
| `xlsx-republish`    | excelToJson + dead code            | **Remove** (Rust replaces reading; dead code removed) |
| `docx`              | dead code only (markdownToWord)    | **Remove**             |
| `@xmldom/xmldom`    | extractExcelImages (transitive)    | **Remove** (Rust replaces) |
| `yauzl`             | loadExcelZipEntries (transitive)   | **Remove** (Rust replaces) |
| `mammoth`           | wordToMarkdown (live)              | Keep                   |
| `turndown`          | wordToMarkdown (live)              | Keep                   |
| `turndown-plugin-gfm` | wordToMarkdown (live)           | Keep                   |
| `@types/turndown`   | TS types for turndown              | Keep                   |
| `pptx2json`         | pptToJson (live)                   | Keep                   |

**Net result: 4 packages removed, 5 retained.**

## 2. Migration Strategy: Selective Function Migration

### 2.1 Why Not Full Migration

This module is fundamentally different from the previous 4 modules (credential-crypto, auth, fs-bridge, database):

- **No node-gyp dependencies.** All current npm packages (mammoth, turndown, xlsx-republish, pptx2json, docx) are pure JavaScript. The primary motivation of previous modules -- eliminating native compilation issues -- does not apply here.
- **mammoth has no Rust equivalent.** mammoth.js provides semantic DOCX-to-HTML conversion with years of edge-case handling for real-world Word documents. The Rust ecosystem has `docx-rs` for OOXML structure access, but no library that performs the semantic-level mapping to HTML. Building this from scratch would be a multi-week effort with inevitable regression risk.
- **pptx2json has no Rust equivalent.** The Rust PPTX ecosystem is essentially non-existent for structured data extraction. Manual ZIP + XML parsing is possible but adds significant complexity for a function that works fine in JS.
- **htmlToPdf requires Electron.** It uses `BrowserWindow.printToPDF()` which cannot exist outside the Electron runtime.

### 2.2 What IS Worth Migrating

**`excelToJson` is the sweet spot.** Reasons:

1. **Mature Rust crates exist.** `calamine` (630M+ downloads) is the de facto standard for Excel reading in Rust. `zip` (151M+ downloads) and `quick-xml` (234M+ downloads) handle the image extraction pipeline.
2. **Most complex TS code.** `extractExcelImages` and its 7 helper methods account for ~180 lines of intricate ZIP traversal, XML DOM parsing, relationship resolution, and base64 encoding. Rust handles this more efficiently and with stronger type safety.
3. **Biggest dependency win.** Migrating excelToJson eliminates `xlsx-republish`, `@xmldom/xmldom`, and `yauzl`. Combined with dead code removal of `docx`, that's 4 packages gone.
4. **Performance gain.** calamine benchmarks at 1.75x faster than JS xlsx libraries for reading. The ZIP + XML pipeline in Rust avoids JS garbage collection overhead on large files with many embedded images.

### 2.3 Scope Summary

| Function         | Action                 | Rationale                                         |
| ---------------- | ---------------------- | ------------------------------------------------- |
| `excelToJson`    | **Migrate to Rust**    | Mature crates; complex TS code; biggest dep reduction |
| `wordToMarkdown` | Keep in TS             | No viable Rust replacement for mammoth            |
| `pptToJson`      | Keep in TS             | No mature Rust PPTX library                       |
| Dead code        | **Remove**             | DocumentConverter class + 4 unused service methods |

## 3. Rust API Design

### 3.1 Crate: `aionui-doc`

Pure Rust crate, no napi types. Located at `native/crates/aionui-doc/`.

```rust
// --- Public types ---

#[derive(Debug, Clone, Serialize)]
pub struct ExcelSheetImage {
    pub row: u32,
    pub col: u32,
    pub src: String,        // data:mime;base64,... URI
    pub width: Option<u32>, // pixels
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExcelSheetData {
    pub name: String,
    pub data: Vec<Vec<serde_json::Value>>,  // 2D cell array
    pub merges: Vec<MergeRange>,
    pub images: Vec<ExcelSheetImage>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MergeRange {
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExcelWorkbookData {
    pub sheets: Vec<ExcelSheetData>,
}

// --- Error type ---

#[derive(Debug, thiserror::Error)]
pub enum DocError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Excel parse error: {0}")]
    Excel(String),

    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("XML parse error: {0}")]
    Xml(String),
}

// --- Public function ---

/// Read an Excel file (.xlsx/.xls) and return structured workbook data
/// including cell values, merge ranges, and embedded images.
pub fn excel_to_json(file_path: &str) -> Result<ExcelWorkbookData, DocError>
```

### 3.2 Internal Architecture

```
excel_to_json(file_path)
  ├── calamine::open_workbook_auto(file_path)
  │   ├── sheet_names() → Vec<String>
  │   ├── worksheet_range(name) → Range<Data> → Vec<Vec<Value>>
  │   └── worksheet_merge_cells(name) → Vec<Dimensions> → Vec<MergeRange>
  │
  └── extract_images(file_path)  [only for .xlsx]
      ├── zip::ZipArchive::new(file)
      ├── parse xl/workbook.xml → sheet-to-relId mapping
      ├── parse xl/_rels/workbook.xml.rels → relId-to-sheetPath
      ├── for each sheet:
      │   ├── parse sheet .rels → find drawing relationships
      │   ├── parse drawing XML → extract anchor positions + blip embed IDs
      │   ├── resolve embed ID → image path via drawing .rels
      │   └── read image bytes → base64 encode → data URI
      └── return HashMap<sheet_name, Vec<ExcelSheetImage>>
```

### 3.3 calamine Data Type Mapping

| calamine `Data` variant | serde_json `Value` |
| ----------------------- | ------------------ |
| `Data::Int(i)`          | `Value::Number(i)` |
| `Data::Float(f)`        | `Value::Number(f)` |
| `Data::String(s)`       | `Value::String(s)` |
| `Data::Bool(b)`         | `Value::Bool(b)` |
| `Data::DateTime(dt)`    | `Value::Number(dt.as_f64())` — Excel serial date |
| `Data::DateTimeIso(s)`  | `Value::String(s)` |
| `Data::DurationIso(s)`  | `Value::String(s)` |
| `Data::Error(e)`        | `Value::Null` — same as xlsx-republish behavior |
| `Data::Empty`           | `Value::Null` |

### 3.4 Dependencies

```toml
[dependencies]
calamine = "0.34"
zip = "2"
quick-xml = "0.37"
base64 = "0.22"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
```

## 4. FFI Boundary Design (napi binding)

### 4.1 Binding Function

```rust
// native/binding/src/doc.rs

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct JsExcelSheetImage {
    pub row: u32,
    pub col: u32,
    pub src: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[napi(object)]
pub struct JsMergeRange {
    pub s: JsMergeCell,  // match TS ExcelSheetData.merges format
    pub e: JsMergeCell,
}

#[napi(object)]
pub struct JsMergeCell {
    pub r: u32,
    pub c: u32,
}

#[napi(object)]
pub struct JsExcelSheetData {
    pub name: String,
    pub data: serde_json::Value,  // Vec<Vec<Value>> serialized
    pub merges: Vec<JsMergeRange>,
    pub images: Vec<JsExcelSheetImage>,
}

#[napi(object)]
pub struct JsExcelWorkbookData {
    pub sheets: Vec<JsExcelSheetData>,
}

#[napi]
pub async fn excel_to_json(file_path: String) -> Result<JsExcelWorkbookData> {
    // Spawn blocking task for file I/O + parsing
    let result = tokio::task::spawn_blocking(move || {
        aionui_doc::excel_to_json(&file_path)
    })
    .await
    .map_err(|e| napi::Error::from_reason(e.to_string()))?
    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(convert_to_js(result))
}
```

### 4.2 TypeScript Declaration

```typescript
// Added to native/binding/index.d.ts

export interface NativeExcelSheetImage {
  row: number;
  col: number;
  src: string;
  width?: number;
  height?: number;
}

export interface NativeExcelSheetData {
  name: string;
  data: unknown[][];
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  images: NativeExcelSheetImage[];
}

export interface NativeExcelWorkbookData {
  sheets: NativeExcelSheetData[];
}

export function excelToJson(filePath: string): Promise<NativeExcelWorkbookData>;
```

## 5. Error Handling Strategy

The current TS code wraps everything in try/catch and returns `{ success: false, error: message }`. The Rust function throws on error, and the **TS caller** (ConversionService) catches and wraps as before.

| Rust Error Variant | JS Error Message | Trigger |
| --- | --- | --- |
| `DocError::Io` | "IO error: {detail}" | File not found, permission denied |
| `DocError::Excel` | "Excel parse error: {detail}" | Corrupted/unsupported format |
| `DocError::Zip` | "ZIP error: {detail}" | Invalid ZIP structure (image extraction) |
| `DocError::Xml` | "XML parse error: {detail}" | Malformed OOXML in image metadata |

Image extraction errors are **non-fatal**: if image extraction fails, sheets are returned with empty `images` arrays (matching current TS behavior where `extractExcelImages` returns `{}` on error).

## 6. Migration Plan

### 6.1 Strategy: All-at-once for excelToJson

Since only `documentBridge.ts` calls `conversionService.excelToJson`, and that function is the sole target, the switch is a single import change.

### 6.2 Step-by-step

1. **Create `aionui-doc` crate** with `excel_to_json` function + unit tests
2. **Add napi binding** (`excelToJson`) to binding crate
3. **Write contract tests** comparing Rust output to TS output for identical Excel files
4. **Run benchmarks** on varying file sizes
5. **Switch ConversionService.excelToJson** to call Rust `excelToJson` from `@aionui/native`
6. **Remove dead code**:
   - Delete `src/common/chat/document/DocumentConverter.ts`
   - Remove unused methods from ConversionService (markdownToWord, jsonToExcel, htmlToPdf, markdownToPdf)
   - Remove all `extractExcelImages` + helper methods from ConversionService
7. **Remove npm packages**: `xlsx-republish`, `docx`, `@xmldom/xmldom` (if in package.json), `yauzl` (if in package.json)
8. **Update electron-builder.yml** if any of these packages had special packaging rules
9. **Run full test suite** to verify zero regressions

### 6.3 ConversionService After Migration

```typescript
// conversionService.ts — simplified
import { excelToJson as nativeExcelToJson } from '@aionui/native';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import PPTX2Json from 'pptx2json';

class ConversionService {
  private turndownService: TurndownService;

  constructor() { /* turndown init */ }

  async wordToMarkdown(filePath: string): Promise<ConversionResult<string>> {
    // unchanged — mammoth + turndown
  }

  async excelToJson(filePath: string): Promise<ConversionResult<ExcelWorkbookData>> {
    try {
      const data = await nativeExcelToJson(filePath);
      return { success: true, data: { sheets: data.sheets } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async pptToJson(filePath: string): Promise<ConversionResult<PPTJsonData>> {
    // unchanged — pptx2json
  }
}
```

## 7. Test Strategy

### 7.1 Rust Unit Tests (`cargo test`)

| Test | Description |
| --- | --- |
| `read_xlsx_single_sheet` | Parse basic xlsx, verify sheet name + cell data |
| `read_xlsx_multi_sheet` | Multiple sheets, correct ordering |
| `read_xls_format` | Legacy .xls format support |
| `cell_type_mapping` | String, number, float, bool, date, empty → correct serde_json::Value |
| `merge_ranges` | Verify merge cell coordinates |
| `empty_workbook` | Workbook with no data rows |
| `extract_images_basic` | xlsx with embedded PNG, verify base64 data URI + position |
| `extract_images_multiple` | Multiple images across sheets |
| `extract_images_no_images` | xlsx without images returns empty arrays |
| `zip_path_normalization` | Backslash paths, relative paths, `..` segments |
| `xml_namespace_variants` | Handle both prefixed (`xdr:twoCellAnchor`) and unprefixed tags |
| `image_size_conversion` | EMU-to-pixel calculation (divide by 9525) |

### 7.2 Contract Tests (Vitest)

Compare Rust `excelToJson` output against TS `xlsx-republish` output for identical input files:

| Test | Input | Assertion |
| --- | --- | --- |
| `basic_workbook` | Small xlsx with 3 columns, 10 rows | Sheet names, data arrays match |
| `multi_sheet` | Workbook with 3 sheets | All sheets present with correct data |
| `cell_types` | Mixed types: string, number, date, boolean, formula result | Type mapping matches |
| `merge_cells` | Workbook with merged regions | Merge ranges match TS format `{ s: {r,c}, e: {r,c} }` |
| `embedded_images` | xlsx with 2 PNG images | Image count, positions, base64 data match |
| `large_workbook` | 1000 rows, 20 columns | Data integrity, no truncation |
| `empty_sheets` | Workbook with empty sheet | Returns sheet with empty data array |
| `xls_format` | Legacy .xls file | Same data output as .xlsx equivalent |

### 7.3 Migration Tests

After caller switch, run the existing test suite (`bun run test`) — all ExcelViewer and document bridge tests must pass unchanged.
