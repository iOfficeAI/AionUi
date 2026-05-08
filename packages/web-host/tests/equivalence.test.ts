/**
 * Placeholder for `bun test equivalence` at packages/web-host/.
 *
 * Real equivalence test lives at
 *   packages/desktop/tests/integration/m5-equivalence.test.ts
 * because web-host CANNOT import packages/desktop (dependency boundary
 * grep — see requirements). The test is invoked from the desktop project.
 *
 * Run with:
 *   bun run vitest --project desktop run packages/desktop/tests/integration/m5-equivalence.test.ts
 * or from the repo root:
 *   bunx vitest run packages/desktop/tests/integration/m5-equivalence.test.ts
 */

import { describe, it } from 'vitest';

describe('equivalence (pointer)', () => {
  it('see packages/desktop/tests/integration/m5-equivalence.test.ts', () => {
    // intentional no-op
  });
});
