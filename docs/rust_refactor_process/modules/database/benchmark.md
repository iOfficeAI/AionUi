# Database Module -- Benchmark

## Test Environment

| Property | Value |
| -------- | ----- |
| OS       | --    |
| CPU      | --    |
| RAM      | --    |
| Node.js  | --    |
| Rust     | --    |

## Operation Comparison

| Operation                           | TS p50 (ms) | TS p95 (ms) | Rust p50 (ms) | Rust p95 (ms) | Speedup |
| ----------------------------------- | ----------- | ----------- | ------------- | ------------- | ------- |
| createUser                          | --          | --          | --            | --            | --      |
| getUser                             | --          | --          | --            | --            | --      |
| insertMessage                       | --          | --          | --            | --            | --      |
| getConversationMessages (100 msgs)  | --          | --          | --            | --            | --      |
| getConversationMessages (1000 msgs) | --          | --          | --            | --            | --      |
| setConfig / getConfig               | --          | --          | --            | --            | --      |
| vacuum                              | --          | --          | --            | --            | --      |
| runMigrations                       | --          | --          | --            | --            | --      |

## Memory Usage

| Operation              | TS heap delta (KB) | Rust heap delta (KB) | Reduction |
| ---------------------- | ------------------ | -------------------- | --------- |
| 1000 insertMessage     | --                 | --                   | --        |
| Full conversation load | --                 | --                   | --        |

## Conclusion

<!-- TO BE FILLED by rust-bench -->
