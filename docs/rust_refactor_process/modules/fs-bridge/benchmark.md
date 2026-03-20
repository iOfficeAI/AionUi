# FS Bridge Module -- Benchmark

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
| readFile (1KB)             | --          | --          | --            | --            | --      |
| readFile (1MB)             | --          | --          | --            | --            | --      |
| readFileBuffer (10MB)      | --          | --          | --            | --            | --      |
| writeFile (1MB)            | --          | --          | --            | --            | --      |
| getFilesByDir (100 files)  | --          | --          | --            | --            | --      |
| getFilesByDir (1000 files) | --          | --          | --            | --            | --      |
| getImageBase64 (5MB image) | --          | --          | --            | --            | --      |
| copyFiles (directory tree) | --          | --          | --            | --            | --      |

## Memory Usage

| Operation                               | TS heap delta (KB) | Rust heap delta (KB) | Reduction |
| --------------------------------------- | ------------------ | -------------------- | --------- |
| Read 100 files sequentially             | --                 | --                   | --        |
| Recursive directory listing (deep tree) | --                 | --                   | --        |

## Conclusion

<!-- TO BE FILLED by rust-bench -->
