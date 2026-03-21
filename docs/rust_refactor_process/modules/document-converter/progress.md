# Document Converter Module -- Progress

## Status

| Stage          | Status      | Date       | Notes |
| -------------- | ----------- | ---------- | ----- |
| Design         | complete    | 2026-03-21 | Selective migration: only excelToJson to Rust; wordToMarkdown/pptToJson stay TS; dead code removal |
| Implementation | complete    | 2026-03-21 | aionui-doc crate + napi binding; 28 Rust unit tests + 11 contract tests passing |
| Benchmark      | complete    | 2026-03-21 | Rust 1.2-4.4x faster; biggest gain on large files (4.4x at 10K rows) |
| Migration      | complete    | 2026-03-21 | ConversionService.excelToJson uses Rust; docx+xlsx-republish removed; DocumentConverter deleted; 1302 tests pass |

## Milestones

| Milestone           | Target | Actual     | Status  |
| ------------------- | ------ | ---------- | ------- |
| design.md complete  | --     | 2026-03-21 | done    |
| Crate compiles      | --     | 2026-03-21 | done    |
| Contract tests pass | --     | 2026-03-21 | done    |
| Benchmark complete  | --     | 2026-03-21 | done    |
| Callers migrated    | --     | 2026-03-21 | done    |
| Old TS removed      | --     | 2026-03-21 | done    |

## Decision Log

| Date       | Decision                                                                    | Rationale                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-21 | Selective function migration (not full module rewrite)                       | No node-gyp deps to eliminate; mammoth/pptx2json have no Rust equivalents; excelToJson has best crate coverage |
| 2026-03-21 | Only migrate excelToJson to Rust                                            | calamine (630M DL), zip (151M DL), quick-xml (234M DL) are all production-grade; biggest dep reduction (4 packages removed) |
| 2026-03-21 | Keep wordToMarkdown in TS                                                   | mammoth.js semantic DOCX-to-HTML conversion has no Rust equivalent; docx-rs only exposes raw OOXML structure |
| 2026-03-21 | Keep pptToJson in TS                                                        | Rust PPTX ecosystem is immature; pptx2json works fine; manual ZIP+XML parsing adds complexity without clear benefit |
| 2026-03-21 | Remove DocumentConverter class as dead code                                 | Zero external callers; singleton never imported anywhere |
| 2026-03-21 | Remove unused ConversionService methods (markdownToWord, jsonToExcel, htmlToPdf, markdownToPdf) | Zero external callers; reduces maintenance surface |
| 2026-03-21 | Use calamine for Excel reading + zip/quick-xml for image extraction          | calamine 1.75x faster than JS xlsx; zip+quick-xml replaces yauzl+@xmldom/xmldom with stronger typing |
| 2026-03-21 | Image extraction errors are non-fatal                                       | Matches current TS behavior where extractExcelImages catches errors and returns empty object |
| 2026-03-21 | Async napi function (not sync)                                              | File I/O + parsing is CPU-bound; should not block Node.js event loop |
| 2026-03-21 | Sync napi function in practice (no tokio spawn_blocking)                     | calamine operations complete in <30ms for typical files; async overhead not justified |
| 2026-03-21 | Remove xlsx-republish and docx from package.json                             | xlsx-republish only used by dead code + now-migrated excelToJson; docx only used by dead markdownToWord |
| 2026-03-21 | Delete DocumentConverter class entirely                                       | Zero external callers; singleton exported but never imported anywhere |
| 2026-03-21 | Remove 4 unused ConversionService methods                                    | markdownToWord, jsonToExcel, htmlToPdf, markdownToPdf had zero callers |
| 2026-03-21 | Use calamine 0.26 + manual merge cell extraction via ZIP/XML                 | calamine 0.26 lacks worksheet_merge_cells API; extracting from sheet XML via quick-xml is simple and sufficient |

## Blockers

| Blocker | Severity | Status | Resolution |
| ------- | -------- | ------ | ---------- |
| --      | --       | --     | --         |

## Confidence Assessment

| Aspect            | Level  | Notes                                                                                                                              |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| API compatibility | High   | excelToJson output structure matches ExcelWorkbookData type; merges format preserved as { s: {r,c}, e: {r,c} } |
| Performance gain  | Medium | calamine reads faster; image extraction avoids JS GC overhead; net gain depends on workload (small files see less benefit) |
| Migration risk    | Low    | Single caller (documentBridge.ts); ConversionService wraps result; contract tests verify output parity |
