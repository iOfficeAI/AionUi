# Auth Module -- Benchmark

## Test Environment

| Property | Value |
| -------- | ----- |
| OS       | --    |
| CPU      | --    |
| RAM      | --    |
| Node.js  | --    |
| Rust     | --    |

## Operation Comparison

| Operation         | TS p50 (ms) | TS p95 (ms) | Rust p50 (ms) | Rust p95 (ms) | Speedup |
| ----------------- | ----------- | ----------- | ------------- | ------------- | ------- |
| hashPassword      | --          | --          | --            | --            | --      |
| verifyPassword    | --          | --          | --            | --            | --      |
| generateToken     | --          | --          | --            | --            | --      |
| verifyToken       | --          | --          | --            | --            | --      |
| generateSessionId | --          | --          | --            | --            | --      |

## Memory Usage

| Operation              | TS heap delta (KB) | Rust heap delta (KB) | Reduction |
| ---------------------- | ------------------ | -------------------- | --------- |
| hashPassword (1000x)   | --                 | --                   | --        |
| verifyPassword (1000x) | --                 | --                   | --        |

## Conclusion

<!-- TO BE FILLED by rust-bench -->
