# Server Scripts Fix & Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `bun run server` (crashes with `better-sqlite3 not supported in Bun`) by switching the script body to tsx/Node.js, and add `server:remote`, `server:prod`, `server:prod:remote`, `build:server:run` variants aligned with the `webui` script family.

**Architecture:** Pure configuration change — only `package.json` is modified. `tsx` is added as an explicit devDependency so the Node.js TypeScript runner is pinned and available without relying on Bun's on-demand package cache. No business code changes.

**Tech Stack:** `tsx ^4.19.1`, `cross-env ^7.0.3` (already installed), Node.js (runtime provided by tsx), Bun (script runner only).

**Spec:** `docs/superpowers/specs/2026-03-20-server-scripts-design.md`

---

## File Map

| File           | Change                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` | Add `tsx` to `devDependencies`; replace `server` script; add `server:remote`, `server:prod`, `server:prod:remote`, `build:server:run` scripts |

---

## Task 1: Install tsx as devDependency

**Files:**

- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Install tsx**

```bash
cd /Users/zhangyaxiong/Workspace/src/github/iOfficeAI/AionUi-Bak
bun add -D tsx@^4.19.1
```

Expected: `package.json` devDependencies now contains `"tsx": "^4.19.1"` and `bun.lock` is updated.

- [ ] **Step 2: Verify tsx is installed**

```bash
bunx tsx --version
```

Expected: prints a version string like `4.x.x`.

---

## Task 2: Update server scripts in package.json

**Files:**

- Modify: `package.json` (scripts section, lines 55–56)

Current state:

```json
"server": "bun run src/server.ts",
"build:server": "bun build src/server.ts --outdir dist-server --target node"
```

- [ ] **Step 1: Replace `server` and add new variants**

Edit `package.json` scripts. Replace the two existing server-related lines with:

```json
"server":             "cross-env NODE_ENV=development tsx src/server.ts",
"server:remote":      "cross-env NODE_ENV=development ALLOW_REMOTE=true tsx src/server.ts",
"server:prod":        "cross-env NODE_ENV=production tsx src/server.ts",
"server:prod:remote": "cross-env NODE_ENV=production ALLOW_REMOTE=true tsx src/server.ts",
"build:server":       "bun build src/server.ts --outdir dist-server --target node",
"build:server:run":   "bun build src/server.ts --outdir dist-server --target node && node dist-server/server.js"
```

> Note: keep `build:server` unchanged (already correct). Only `server` is replaced; the others are new additions.

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```

Expected: `valid`

---

## Task 3: Verify the fix

- [ ] **Step 1: Start dev server (Ctrl+C to stop)**

```bash
bun run server
```

Expected: `[server] WebUI running on http://localhost:3000` — no `better-sqlite3` error.

- [ ] **Step 2: Verify remote variant sets ALLOW_REMOTE (Ctrl+C to stop)**

```bash
bun run server:remote
```

Expected: `[server] WebUI running on http://0.0.0.0:3000`

- [ ] **Step 3: Verify prod variant**

```bash
bun run server:prod
```

Expected: server starts successfully with `NODE_ENV=production`.

- [ ] **Step 4: Verify build + run**

```bash
bun run build:server:run
```

Expected: build succeeds, then `[server] WebUI running on http://localhost:3000`.

- [ ] **Step 5: Run test suite to confirm no regressions**

```bash
bun run test
```

Expected: all tests pass.

---

## Task 4: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add package.json bun.lock
git commit -m "fix(server): switch to tsx/Node.js runtime, add server script variants"
```

Expected: commit created with no errors.
