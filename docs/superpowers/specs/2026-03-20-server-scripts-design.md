# Server Scripts Fix & Variants Design

**Date:** 2026-03-20
**Status:** Approved

## Problem

`bun run server` fails with:

```
error: 'better-sqlite3' is not yet supported in Bun.
```

Root cause: the current script value is `"server": "bun run src/server.ts"`, which uses **Bun as the runtime**. `better-sqlite3` is a native Node.js addon (.node binary) that Bun's runtime does not support.

> Note: `bun run <script-name>` (Bun as a _script runner_) is safe and will remain the way developers invoke scripts. The fix changes what runs _inside_ the script value — from Bun-as-runtime to Node.js-via-tsx.

## Goal

1. Fix `bun run server` by switching the script body from Bun runtime to Node.js runtime via `tsx`.
2. Add server script variants aligned with the existing `webui` script family.

## Non-Goals

- No changes to database code (`better-sqlite3` works correctly under Node.js).
- No changes to `src/server.ts`.
- No changes to the production build pipeline (`build:server` already targets Node.js).

## Design

### Runtime: tsx on Node.js

`tsx` transpiles TypeScript on the fly and runs it under Node.js. It is already used in the project via `bunx tsx` in debug scripts. Making it an explicit devDependency removes the implicit dependency on Bun's package cache and pins the version.

Version to install: `tsx@^4.19.1`

`cross-env` is already a devDependency — no new packages beyond `tsx`.

### Script Matrix

| Script               | NODE_ENV    | ALLOW_REMOTE | Notes                                             |
| -------------------- | ----------- | ------------ | ------------------------------------------------- |
| `server`             | development | false        | localhost only, dev                               |
| `server:remote`      | development | true         | allow external connections, dev                   |
| `server:prod`        | production  | false        | localhost only, production                        |
| `server:prod:remote` | production  | true         | allow external connections, production            |
| `build:server`       | —           | —            | esbuild bundle for Node.js (unchanged)            |
| `build:server:run`   | development | false        | build then run bundle; for dev smoke-testing only |

`NODE_ENV` is always set explicitly so downstream code has a reliable value regardless of shell environment.

### package.json changes

**devDependencies — add:**

```
"tsx": "^4.19.1"
```

**scripts — replace/add:**

```json
"server":             "cross-env NODE_ENV=development tsx src/server.ts",
"server:remote":      "cross-env NODE_ENV=development ALLOW_REMOTE=true tsx src/server.ts",
"server:prod":        "cross-env NODE_ENV=production tsx src/server.ts",
"server:prod:remote": "cross-env NODE_ENV=production ALLOW_REMOTE=true tsx src/server.ts",
"build:server":       "bun build src/server.ts --outdir dist-server --target node",
"build:server:run":   "bun build src/server.ts --outdir dist-server --target node && node dist-server/server.js"
```

## Verification

```bash
# Dev mode — should start without better-sqlite3 error
bun run server

# Dev mode with remote access
bun run server:remote

# Production mode, localhost only
bun run server:prod

# Production mode with remote access
bun run server:prod:remote

# Build + run compiled output (dev smoke-test)
bun run build:server:run
```

Expected for all: `[server] WebUI running on http://localhost:3000` (or `0.0.0.0:3000` for `:remote` variants) with no runtime errors.
