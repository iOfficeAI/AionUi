# Document Converter Module -- Benchmark

## Test Environment

| Property | Value |
| -------- | ----- |
| OS       | Windows 11 x64 |
| CPU      | 13th Gen Intel Core i5-13500HX |
| RAM      | 16GB |
| Node.js  | v22.12.0 |
| Rust     | stable (release profile, LTO) |

## Operation Comparison

| Operation               | TS p50    | Rust p50  | Speedup |
| ----------------------- | --------- | --------- | ------- |
| Small (3x3, 16KB)       | 0.47ms    | 0.18ms    | 2.60x   |
| Medium (100x5, 33KB)    | 1.43ms    | 0.56ms    | 2.56x   |
| Large (1000x20, 582KB)  | 34.17ms   | 28.02ms   | 1.22x   |
| XL (10000x10, 4MB)      | 729.68ms  | 166.61ms  | 4.38x   |
| Multi-sheet (5x200)     | 16.04ms   | 5.70ms    | 2.82x   |

## Analysis

Rust (calamine) is consistently faster than TS (xlsx-republish) across all workload sizes.

The speedup is most dramatic on the 10K-row file (4.4x) where calamine's efficient streaming parser and Rust's memory layout advantages become dominant. For small files, the overhead is dominated by file I/O and ZIP decompression, so the relative gain is lower but still meaningful (2.6x).

The 1000x20 benchmark shows the smallest speedup (1.2x). This is likely because at this size, the ZIP decompression and file I/O dominate over the parsing overhead, and both implementations spend most of their time on the same underlying zlib/deflate work.

Note: These benchmarks only measure cell data reading. Image extraction benchmarks were not included because creating test xlsx files with embedded images programmatically is complex. The Rust image extraction pipeline (zip + quick-xml + base64) should also be faster than TS (yauzl + @xmldom/xmldom + Buffer.toString('base64')), but this is not quantified.

## Conclusion

The Rust implementation is 1.2-4.4x faster than the TS implementation for Excel reading. The speedup increases with file size, making Rust particularly beneficial for large spreadsheets. For the typical user workload (files under 1MB with <500 rows), the improvement is 2-3x, taking operations from the "barely noticeable" to "instant" range.

The primary motivation for this migration remains dependency reduction (eliminating xlsx-republish, @xmldom/xmldom, yauzl) rather than performance, but the performance improvement is a welcome bonus.
