# Document Converter Module -- Rust Design

> This document will be fully populated by the `rust-design` skill after analyzing the TypeScript source.
> Source: `src/common/chat/document/DocumentConverter.ts`, `src/process/services/conversionService.ts`

## 1. TypeScript Interface Analysis

**Source files:**

- `src/common/chat/document/DocumentConverter.ts` (markdown-centric converter)
- `src/process/services/conversionService.ts` (advanced conversion service)
- `src/process/bridge/documentBridge.ts` (IPC bridge)

**Function signatures:**

<!-- TO BE FILLED by rust-design -->

| TS Function           | Parameters                 | Return Type                 | Sync/Async |
| --------------------- | -------------------------- | --------------------------- | ---------- |
| `wordToMarkdown`      | `arrayBuffer: ArrayBuffer` | `Promise<string>`           | async      |
| `markdownToWord`      | `markdown: string`         | `Promise<ArrayBuffer>`      | async      |
| `excelToMarkdown`     | `arrayBuffer: ArrayBuffer` | `Promise<string>`           | async      |
| `markdownToExcel`     | `markdown: string`         | `Promise<ArrayBuffer>`      | async      |
| `parseMarkdownTables` | `markdown: string`         | `[{name, data}]`            | sync       |
| `excelToJson`         | `filePath: string`         | `Promise<ConversionResult>` | async      |
| `jsonToExcel`         | `data, targetPath`         | `Promise<ConversionResult>` | async      |
| `wordToJson`          | `filePath: string`         | `Promise<ConversionResult>` | async      |
| `extractExcelImages`  | `buffer: Buffer`           | `Promise<ImageData[]>`      | async      |

**Caller sites:**

<!-- TO BE FILLED by rust-design -->

## 2. Rust API Design

<!-- TO BE FILLED by rust-design -->

## 3. Error Handling Strategy

<!-- TO BE FILLED by rust-design -->

## 4. FFI Boundary Design

<!-- TO BE FILLED by rust-design -->

## 5. Migration Plan

<!-- TO BE FILLED by rust-design -->

## 6. Test Strategy

<!-- TO BE FILLED by rust-design -->
