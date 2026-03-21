# FS Bridge Module -- Benchmark

## Test Environment

| Property | Value                                       |
| -------- | ------------------------------------------- |
| OS       | Windows 11 10.0.26200 (x64)                 |
| CPU      | 13th Gen Intel Core i5-13500HX              |
| RAM      | 39.7 GB                                     |
| Node.js  | v22.12.0                                    |
| Rust     | stable (release build, LTO + strip symbols) |

## Operation Comparison

| Operation                               | TS p50   | TS p95   | Rust p50 | Rust p95 | Speedup  |
| --------------------------------------- | -------- | -------- | -------- | -------- | -------- |
| readDirectoryTree (50 files, depth 3)   | 1.70ms   | 2.52ms   | 0.894ms  | 1.04ms   | **1.9x** |
| readDirectoryTree (500 files, depth 5)  | 14.51ms  | 15.83ms  | 6.97ms   | 7.61ms   | **2.1x** |
| readDirectoryTree (2000 files, depth 8) | 55.58ms  | 58.32ms  | 27.60ms  | 28.82ms  | **2.0x** |
| copyDirectory (50 files)                | 19.41ms  | 20.93ms  | 16.26ms  | 20.40ms  | **1.2x** |
| copyDirectory (500 files)               | 182.13ms | 207.99ms | 156.05ms | 160.05ms | **1.2x** |
| verifyDirectoryStructure (50 files)     | 0.337ms  | 0.561ms  | 0.192ms  | 0.245ms  | **1.8x** |
| ensureDir (existing dir)                | 3.9us    | 5.7us    | 9.4us    | 12us     | 0.4x     |
| ensureDir (new nested dir)              | 0.139ms  | 0.257ms  | 0.116ms  | 0.223ms  | **1.2x** |

## Analysis

### Where Rust wins: metadata-intensive operations

The primary performance gain comes from **readDirectoryTree**, which is the most called operation in production (triggered every time the user browses their workspace). The 2x speedup is consistent across directory sizes (50, 500, 2000 files) and comes from Rust's more efficient `readdir` + `stat` syscall handling compared to Node.js `fs/promises` which adds async overhead per call.

**verifyDirectoryStructure** shows a similar 1.8x gain for the same reason: lots of `readdir` + entry comparison.

### Where gains are marginal: I/O-bound operations

**copyDirectory** is only 1.2x faster because the bottleneck is disk I/O (the actual `copyFile` syscall), not the Rust vs Node.js overhead. Both implementations spend most of their time waiting for the OS to move bytes.

### Where Rust is slower: trivial sync operations

**ensureDir (existing dir)** is slower in Rust because the napi FFI boundary overhead (~5us) exceeds the actual work (~4us for a single `lstat` check). This is expected and acceptable because:

1. `ensureDir` is called only a handful of times during application startup
2. The absolute difference is 5 microseconds, which is imperceptible
3. The new-directory case (the less common but more expensive path) is 1.2x faster

### Production impact

The operation that matters most for user experience is **readDirectoryTree**, which runs on every workspace file panel interaction. Cutting its latency in half (55ms to 28ms for a 2000-file directory) directly improves perceived responsiveness. For typical workspaces with a few hundred files, response time drops from ~15ms to ~7ms.

## Conclusion

The Rust migration delivers a consistent **2x speedup for directory traversal**, which is the hot-path operation in production. Copy and verify operations see modest 1.2-1.8x gains. The sync `ensureDir` is marginally slower due to FFI overhead but is only called during initialization. Overall, the migration provides a meaningful latency improvement for the most user-visible filesystem operation while the copy/verify gains are a bonus for background tasks like data migration.
