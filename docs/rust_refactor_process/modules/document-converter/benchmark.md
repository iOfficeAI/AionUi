# Document Converter Module -- Benchmark

## Test Environment

| Property | Value |
| -------- | ----- |
| OS       | --    |
| CPU      | --    |
| RAM      | --    |
| Node.js  | --    |
| Rust     | --    |

## Operation Comparison

| Operation                  | TS p50 (ms) | TS p95 (ms) | Rust p50 (ms) | Rust p95 (ms) | Speedup |
| -------------------------- | ----------- | ----------- | ------------- | ------------- | ------- |
| wordToMarkdown (small doc) | --          | --          | --            | --            | --      |
| wordToMarkdown (large doc) | --          | --          | --            | --            | --      |
| excelToMarkdown (100 rows) | --          | --          | --            | --            | --      |
| excelToMarkdown (10k rows) | --          | --          | --            | --            | --      |
| markdownToWord             | --          | --          | --            | --            | --      |
| markdownToExcel            | --          | --          | --            | --            | --      |
| excelToJson (multi-sheet)  | --          | --          | --            | --            | --      |

## Memory Usage

| Operation              | TS heap delta (KB) | Rust heap delta (KB) | Reduction |
| ---------------------- | ------------------ | -------------------- | --------- |
| Parse 10MB Excel       | --                 | --                   | --        |
| Convert large Word doc | --                 | --                   | --        |

## Conclusion

<!-- TO BE FILLED by rust-bench -->
