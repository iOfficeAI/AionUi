// Re-export team constants from source so E2E tests share the same whitelist.
// Relative path required: Playwright uses its own esbuild and does not resolve @/* aliases.
import { TEAM_SUPPORTED_BACKENDS as ALL_BACKENDS } from '../../../src/common/types/teamTypes';

// Support TEAM_AGENT=claude or TEAM_AGENT=claude,codex to run only specific leader types.
// Values are validated against the full whitelist; unknown types are silently dropped.
const envLeaderTypes = process.env.TEAM_AGENT;

export const TEAM_SUPPORTED_BACKENDS: ReadonlySet<string> = envLeaderTypes
  ? new Set(
      envLeaderTypes
        .split(',')
        .map((s) => s.trim())
        .filter((t) => ALL_BACKENDS.has(t))
    )
  : ALL_BACKENDS;
