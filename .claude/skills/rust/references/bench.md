# rust-bench: Benchmark Sub-Workflow

Measure and compare performance between the TypeScript and Rust implementations.

## Prerequisites

- The module's Rust implementation is complete and passing contract tests
- Both TS and Rust implementations are loadable in the same test environment
- The module's `progress.md` shows Implementation stage as `complete`

## Workflow

### Step 1: Set Up Benchmark Environment

Create a benchmark script at `tests/bench/<module>-bench.ts` (or `.mjs`):

```typescript
import { performance } from 'node:perf_hooks';

const ITERATIONS = 1000;
const WARMUP = 100;

function bench(name: string, fn: () => void) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn();

  // Measure
  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
  };
}
```

Record environment info: OS, CPU model, RAM, Node.js version, Rust version.

### Step 2: Establish TS Baseline

Run every key operation from `design.md` through the TS implementation:

- Use realistic input data (not trivial one-liners)
- Include both small and large inputs to test scaling
- Record p50, p95, p99 latency
- Measure heap delta using `process.memoryUsage()` before/after

### Step 3: Measure Rust Performance

Run the exact same operations and inputs through the Rust addon:

- Same iteration count, same warmup
- Same measurement methodology
- Record the same metrics

### Step 4: Fill benchmark.md

Populate the module's `benchmark.md` with:

1. **Test Environment** table -- exact hardware and software versions
2. **Operation Comparison** table -- TS vs Rust latency for each operation
3. **Memory Usage** table -- heap delta comparison for bulk operations
4. **Conclusion** -- summarize the speedup, note any operations where Rust wasn't faster (and why), and assess whether the performance gain justifies the migration

### Step 5: Update progress.md

Update the module's `progress.md`:
- Set Benchmark stage status to `complete`
- Record the date
- Summarize key findings (e.g., "3.2x faster for hash, 8x faster for bulk reads")
- Update confidence assessment
