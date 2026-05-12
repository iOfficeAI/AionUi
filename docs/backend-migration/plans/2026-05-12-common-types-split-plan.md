# FW-3 Plan — Split `packages/desktop/src/common/types/` by Domain

- **Date**: 2026-05-12
- **Branch target**: `feat/backend-migration` (no PR to `main`)
- **Working branch**: `refactor/split-common-types`
- **Author**: plan-writer-fw3
- **Related**:
  - `AGENTS.md` → Directory size limit (10 direct children)
  - `docs/contributing/file-structure.md` § Directory Size Limit
  - `docs/backend-migration/plans/2026-05-12-frontend-dead-code-audit.md` §2 / §7.3
  - `docs/backend-migration/handoffs/N6-outcome.md` R3

## 0. Problem

`packages/desktop/src/common/types/` currently holds **18 files + 1 subdirectory (`codex/`) = 19 direct children**, which exceeds the 10-children cap mandated in `AGENTS.md`:

```
packages/desktop/src/common/types/
├── acpTypes.ts                  (6261 B)
├── agentModes.ts                 (791 B)
├── assistantTypes.ts            (1764 B)
├── channel.ts                   (1446 B)
├── codex/                        # already grouped — 4 direct children, KEEP AS-IS
├── conversion.ts                (3255 B)
├── database.ts                   (446 B)
├── detectedAgent.ts             (3222 B)
├── electron.ts                   (912 B)
├── fileSnapshot.ts               (625 B)
├── hub.ts                       (1541 B)
├── pptx2json.d.ts                (369 B)     # ambient (3rd-party)
├── preview.ts                    (707 B)
├── providerApi.ts               (2189 B)
├── remoteAgentTypes.ts          (1745 B)     # moved here by N6 C9
├── speech.ts                    (1076 B)
├── teamTypes.ts                 (3349 B)
└── turndown-plugin-gfm.d.ts      (332 B)     # ambient (3rd-party)
```

The root-level `tsconfig.json` includes `packages/desktop/src/**/*`, so ambient `.d.ts` files are picked up regardless of which subdirectory they sit in — **there is no TS path-configuration constraint forcing any particular layout**.

## 1. Goals & Non-Goals

### Goals

1. Split the flat layout into domain subdirectories such that:
   - `common/types/` direct children count ≤ 10 (including the preserved `codex/`)
   - every new subdirectory direct children count ≤ 10 (with slack for growth)
2. Zero semantic change: `git mv` + import path rewrites only — **no edits to type definitions**.
3. Every step must leave `bunx tsc --noEmit` green before the next step begins (atomic commits).
4. Imports use TS path alias `@/common/types/<newpath>` or relative `../types/<newpath>` — consistent with existing style (both forms already present in the codebase).

### Non-Goals

- Do **not** touch `common/types/codex/` (already domain-grouped).
- Do **not** introduce barrel `index.ts`: no existing consumer imports via a barrel, and adding one just to avoid path churn creates a new public API surface.
- Do **not** rename or consolidate types.
- Do **not** alter `.gitignore` / eslint / prettier rules.

## 2. Survey — What's inside each file

All type files except two have **zero** file-to-file `common/types/*` imports. The only internal dependencies:

| File                  | Internal dependency on `common/types/*`                      |
| --------------------- | ------------------------------------------------------------ |
| `agentModes.ts`       | `codex/codexModes` (kept as-is — `codex/` untouched)         |
| `remoteAgentTypes.ts` | `detectedAgent.ts` (re-exports `RemoteAgentProtocol` et al.) |

**External deps (from `common/types/*` into other parts of `common/`)**:

| File             | External dep                                               |
| ---------------- | ---------------------------------------------------------- |
| `database.ts`    | `../chat/chatLib`, `../config/storage`                     |
| `providerApi.ts` | `@/common/config/storage` (`IProvider`, `ModelCapability`) |

After a move, only **these two** same-dir-style imports need updating alongside consumers:

- `remoteAgentTypes.ts` imports from `detectedAgent.ts` → if they land in **different** subdirs, the import path must be rewritten.
- `database.ts`, `providerApi.ts` → their imports point **upward** (`../chat/...`, `../config/...`). After moving into `types/<subdir>/database.ts`, these become `../../chat/...`, `../../config/...`.

## 3. Consumer footprint (grep-verified)

Column **Consumers** = file count (not occurrence count). External ref count computed by:

```bash
grep -rn "types/<basename>" packages/ scripts/ tests/ --include='*.ts' --include='*.tsx' \
  | grep -v "common/types/<basename>\." | awk -F: '{print $1}' | sort -u | wc -l
```

| File                       | Consumers          | Where they live                                                                                                        |
| -------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `acpTypes.ts`              | 10                 | `common/adapter`, `common/chat`, `common/config`, `renderer/components/agent`, `renderer/pages/*`                      |
| `agentModes.ts`            | 2                  | `renderer/utils/model`, `tests/e2e`                                                                                    |
| `assistantTypes.ts`        | 17                 | `common/adapter`, `process/utils`, wide renderer (hooks/assistant + pages/guid + pages/settings + pages/team) + 1 test |
| `channel.ts`               | 7                  | `common/adapter` + `renderer/components/settings/.../channels/*`                                                       |
| `conversion.ts`            | 1                  | `common/adapter/ipcBridge.ts` (dynamic `import()`)                                                                     |
| `database.ts`              | 3                  | `common/adapter/searchMapper`, `process/services/database`, `renderer/pages/conversation/GroupedHistory`               |
| `detectedAgent.ts`         | 2 (+1 intra-types) | `renderer/pages/team/components`, `common/types/remoteAgentTypes.ts`                                                   |
| `electron.ts`              | 1                  | `common/adapter/browser.ts`                                                                                            |
| `fileSnapshot.ts`          | 3                  | `common/adapter/ipcBridge`, `renderer/pages/conversation/Workspace`                                                    |
| `hub.ts`                   | 3                  | `common/adapter/ipcBridge`, `renderer/hooks/agent`, `renderer/pages/settings/AgentSettings`                            |
| `preview.ts`               | 12                 | `common/adapter/ipcBridge`, `common/chat/navigation`, wide renderer (preview page + workspace hook + utils)            |
| `providerApi.ts`           | 2                  | `common/adapter/ipcBridge`, `common/config/configMigration`                                                            |
| `remoteAgentTypes.ts`      | 2                  | `common/adapter/ipcBridge`, `renderer/pages/settings/AgentSettings`                                                    |
| `speech.ts`                | 5                  | `common/adapter/ipcBridge`, `common/config/*`, renderer settings/services                                              |
| `teamTypes.ts`             | 10                 | `common/adapter/{ipcBridge,teamMapper}`, broad `renderer/pages/team/*`                                                 |
| `pptx2json.d.ts`           | 0 (ambient)        | resolved via declare-module, not imported by path                                                                      |
| `turndown-plugin-gfm.d.ts` | 0 (ambient)        | resolved via declare-module, not imported by path                                                                      |

**Total distinct import lines to rewrite**: ~80 across desktop + ~2 in `tests/`.

Two import styles coexist today:

- **Relative**: `'../types/<basename>'` — only in `common/adapter/*` and `common/types/codex/utils/*`
- **Alias**: `'@/common/types/<basename>'` — everywhere else

Both can be rewritten with a file-scoped `sed -i`.

## 4. Grouping candidates

### Candidate A (RECOMMENDED) — by business domain, 6 subdirs (besides `codex/`) + 2 root ambient

```
common/types/
├── agent/                        # 5 files — execution-engine, agent metadata, hub marketplace
│   ├── agentModes.ts
│   ├── assistantTypes.ts
│   ├── detectedAgent.ts
│   ├── hub.ts
│   └── remoteAgentTypes.ts
├── channel/                      # 1 file — messaging channels (lark/telegram/…)
│   └── channel.ts
├── codex/                        # UNCHANGED (4 children)
├── office/                       # 2 files — document conversion + preview
│   ├── conversion.ts
│   └── preview.ts
├── platform/                     # 3 files — host runtime contracts
│   ├── acpTypes.ts
│   ├── electron.ts
│   └── fileSnapshot.ts
├── provider/                     # 2 files — model-provider API + STT
│   ├── providerApi.ts
│   └── speech.ts
├── team/                         # 2 files — team collab (+ message search)
│   ├── database.ts
│   └── teamTypes.ts
├── pptx2json.d.ts                # ambient (stays at root — 3rd-party)
└── turndown-plugin-gfm.d.ts      # ambient (stays at root — 3rd-party)
```

**Root direct-children count**: 7 subdirs + 2 ambient files = **9 ≤ 10** ✅
**Largest subdir**: `agent/` = **5 files** ✅ (still room to grow)

**Rationale**:

- `agent/` groups the "what execution engine exists + how to drive it" cluster. `remoteAgentTypes.ts` → `detectedAgent.ts` intra-types dep is preserved **inside the same subdirectory** → the rewrite becomes `'@/common/types/agent/detectedAgent'`, staying same-dir (`./detectedAgent`). `hub.ts` is the **agent marketplace / extension registry** (`IHubAgentItem`, `HubExtensionStatus`, consumed by `useHubAgents`, `AgentHubModal`, `PresetManagement`), which is fundamentally an agent-domain concern — not a host-runtime contract.
- `platform/` holds host-level runtime contracts: ACP protocol glue, Electron bridge API, file-snapshot (fs host contract). None of them share domain deps.
- `office/` pairs `conversion.ts` (word/excel/ppt/pdf payloads) and `preview.ts` (preview content-type + history) — both describe the document/office layer.
- `provider/` groups user-facing AI provider wiring: model providers + speech-to-text configs.
- `team/` groups team domain (`teamTypes.ts`) with its immediate consumer `database.ts` (message search, which is used by the team/conversation renderer — see §13 note on future rename).
- `channel/` is one file today, but matches the `process/channels/` / `renderer/components/.../channels/` domain — creating the subdir now makes the next plugin-type addition obvious.
- **Ambient `.d.ts` stay at root**: they are 3rd-party shims; moving them into a subdir named e.g. `ambient/` would require changing 0 consumer imports (declare-module is resolved by module name, not path), but adds noise. Root placement is the minimum-surface option.

**Why not merge `channel/` with something**: no shared domain with ACP/provider/team. Keeping it separate makes the "messaging channels" domain explicit and matches the `process/channels/` layout.

**Trade-off**: `platform/` is a slightly broad name — an alternative is `host/` or leaving `acpTypes.ts` at root. We picked `platform/` because all three files describe host-runtime contracts (Electron IPC, ACP protocol, file-snapshot driver).

---

### Candidate B — by consumer topology, 4 subdirs

```
common/types/
├── agent/          # acpTypes + agentModes + assistantTypes + detectedAgent + remoteAgentTypes = 5
├── codex/          # unchanged
├── integration/    # channel + hub + electron + providerApi + speech = 5
├── office/         # conversion + preview + fileSnapshot = 3
├── team/           # teamTypes + database = 2
├── pptx2json.d.ts
└── turndown-plugin-gfm.d.ts
```

Root count: 5 subdirs + 2 ambient = **7 ≤ 10** ✅

**Why rejected**: `integration/` mixes very unrelated domains (`electron.ts` = Electron API contracts vs `channel.ts` = lark/telegram plugins vs `providerApi.ts` = model provider REST API). The grouping name "integration" is vague and a future contributor looking for Electron types in `integration/` will miss it.

---

### Candidate C — finer, 7 subdirs

```
common/types/
├── acp/            # acpTypes.ts = 1
├── agent/          # agentModes + assistantTypes + detectedAgent + remoteAgentTypes = 4
├── channel/        # channel.ts = 1
├── codex/          # unchanged
├── host/           # electron + fileSnapshot + hub = 3
├── office/         # conversion + preview = 2
├── provider/       # providerApi + speech = 2
├── team/           # teamTypes + database = 2
├── pptx2json.d.ts
└── turndown-plugin-gfm.d.ts
```

Root count: 8 subdirs + 2 ambient = **10 ≤ 10** ✅ (**hits the cap exactly**)

**Why rejected**: leaves **zero slack** at the root — any new domain would blow the cap. Also creates 3 single-file directories (`acp/`, `channel/`, none of them likely to grow fast), violating the "merge single-file subdirs" guidance in `docs/contributing/file-structure.md` (line 225).

---

**Recommendation: Candidate A.** It hits the cap at **9 root children** (1 slot of slack), every subdir has ≤ 4 files (plenty of growth room), and the domain names map 1:1 onto existing `process/` / `renderer/` subdirectory names contributors already know.

## 5. Execution plan (atomic steps)

> Each step: `git mv` → update imports → `bunx tsc --noEmit` must pass → commit. If `tsc` fails, fix imports **before** moving on. Do **not** batch multiple moves in one commit.

### Phase 0 — Baseline snapshot

Run from repo root:

```bash
# 0.1 Confirm clean working tree
git status
# Expected: "nothing to commit, working tree clean" on branch refactor/split-common-types

# 0.2 Record baseline
bunx tsc --noEmit && echo "BASELINE_TSC_OK"
bun run lint && echo "BASELINE_LINT_OK"
git rev-parse HEAD > /tmp/fw3-baseline.sha
ls packages/desktop/src/common/types/ | wc -l   # 19 (18 files + codex/)

# 0.3 Create branch (branch name fixed by team-lead)
git checkout -b refactor/split-common-types
```

### Step 1 — Create the subdirectory scaffolds

Creating empty directories isn't a git operation; we move files into them one by one. No separate "create dir" commit.

### Step 2 — Move `office/` (lowest-impact domain, warm-up)

**Files**: `conversion.ts`, `preview.ts`
**Consumer count**: 1 + 12 = 13

```bash
# 2.1 Create target dir implicitly via first mv
mkdir -p packages/desktop/src/common/types/office

git mv packages/desktop/src/common/types/conversion.ts \
       packages/desktop/src/common/types/office/conversion.ts
git mv packages/desktop/src/common/types/preview.ts \
       packages/desktop/src/common/types/office/preview.ts

# 2.2 Rewrite imports — conversion (1 file, dynamic import only)
grep -rln "types/conversion" packages/desktop/src/ --include='*.ts' --include='*.tsx'
# Expected match: packages/desktop/src/common/adapter/ipcBridge.ts

# Apply rewrite:
#   '@/common/types/conversion'  →  '@/common/types/office/conversion'
#   '../types/conversion'        →  '../types/office/conversion'
find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/conversion|@/common/types/office/conversion|g" \
    -e "s|'../types/conversion'|'../types/office/conversion'|g" \
    {} +

# 2.3 Rewrite imports — preview (12 consumers)
grep -rln "types/preview" packages/desktop/src/ --include='*.ts' --include='*.tsx'
# Expected 12 files listed

find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/preview|@/common/types/office/preview|g" \
    -e "s|'../types/preview'|'../types/office/preview'|g" \
    {} +

# 2.4 Verify & commit
bunx tsc --noEmit
bun run lint
git add -A
git commit -m "refactor(types): group office domain under common/types/office"
```

### Step 3 — Move `team/`

**Files**: `teamTypes.ts`, `database.ts`
**Consumer count**: 10 + 3 = 13

`database.ts` moves from `common/types/` to `common/types/team/`. Its internal imports change depth:

```ts
// BEFORE:
import type { TMessage } from '../chat/chatLib';
import type { TChatConversation } from '../config/storage';

// AFTER (one level deeper):
import type { TMessage } from '../../chat/chatLib';
import type { TChatConversation } from '../../config/storage';
```

```bash
mkdir -p packages/desktop/src/common/types/team
git mv packages/desktop/src/common/types/teamTypes.ts packages/desktop/src/common/types/team/teamTypes.ts
git mv packages/desktop/src/common/types/database.ts  packages/desktop/src/common/types/team/database.ts

# 3.1 Fix intra-file imports in moved file (depth change)
sed -i '' \
  -e "s|'../chat/chatLib'|'../../chat/chatLib'|g" \
  -e "s|'../config/storage'|'../../config/storage'|g" \
  packages/desktop/src/common/types/team/database.ts

# 3.2 Rewrite consumer imports — teamTypes
find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/teamTypes|@/common/types/team/teamTypes|g" \
    -e "s|'../types/teamTypes'|'../types/team/teamTypes'|g" \
    {} +

# 3.3 Rewrite consumer imports — database
find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/database|@/common/types/team/database|g" \
    -e "s|'../types/database'|'../types/team/database'|g" \
    {} +

# 3.4 Verify & commit
bunx tsc --noEmit
bun run lint
git add -A
git commit -m "refactor(types): group team domain under common/types/team"
```

### Step 4 — Move `provider/`

**Files**: `providerApi.ts`, `speech.ts`
**Consumer count**: 2 + 5 = 7

`providerApi.ts` has an upward import (`@/common/config/storage`) — that's already an alias, unaffected by depth change.

```bash
mkdir -p packages/desktop/src/common/types/provider
git mv packages/desktop/src/common/types/providerApi.ts packages/desktop/src/common/types/provider/providerApi.ts
git mv packages/desktop/src/common/types/speech.ts      packages/desktop/src/common/types/provider/speech.ts

# 4.1 Rewrite consumer imports — providerApi
find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/providerApi|@/common/types/provider/providerApi|g" \
    -e "s|'../types/providerApi'|'../types/provider/providerApi'|g" \
    {} +

# 4.2 Rewrite consumer imports — speech
find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/speech|@/common/types/provider/speech|g" \
    -e "s|'../types/speech'|'../types/provider/speech'|g" \
    {} +

# 4.3 Verify & commit
bunx tsc --noEmit
bun run lint
git add -A
git commit -m "refactor(types): group provider/speech types under common/types/provider"
```

### Step 5 — Move `channel/`

**Files**: `channel.ts`
**Consumer count**: 7

```bash
mkdir -p packages/desktop/src/common/types/channel
git mv packages/desktop/src/common/types/channel.ts packages/desktop/src/common/types/channel/channel.ts

find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -exec sed -i '' \
    -e "s|@/common/types/channel'|@/common/types/channel/channel'|g" \
    -e "s|'../types/channel'|'../types/channel/channel'|g" \
    {} +

# Note: the trailing quote in the first pattern disambiguates from '@/common/types/channel/xyz' (future).
# Also sanity-check that the global 'codex/' replacements aren't affected:
grep -rn "common/types/channel" packages/desktop/src/ --include='*.ts' --include='*.tsx' \
  | grep -v 'common/types/channel/channel'
# Expected: empty (every match should now end in /channel/channel)

bunx tsc --noEmit
bun run lint
git add -A
git commit -m "refactor(types): group channel types under common/types/channel"
```

### Step 6 — Move `platform/` (ACP + Electron + FileSnapshot)

**Files**: `acpTypes.ts`, `electron.ts`, `fileSnapshot.ts`
**Consumer count**: 10 + 1 + 3 = 14

```bash
mkdir -p packages/desktop/src/common/types/platform
git mv packages/desktop/src/common/types/acpTypes.ts     packages/desktop/src/common/types/platform/acpTypes.ts
git mv packages/desktop/src/common/types/electron.ts     packages/desktop/src/common/types/platform/electron.ts
git mv packages/desktop/src/common/types/fileSnapshot.ts packages/desktop/src/common/types/platform/fileSnapshot.ts

# Three independent sed passes (each file has distinct consumer set)
for base in acpTypes electron fileSnapshot; do
  find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -exec sed -i '' \
      -e "s|@/common/types/${base}|@/common/types/platform/${base}|g" \
      -e "s|'../types/${base}'|'../types/platform/${base}'|g" \
      {} +
done

# Verify no stray references
for base in acpTypes electron fileSnapshot; do
  grep -rn "common/types/${base}\b" packages/desktop/src/ --include='*.ts' --include='*.tsx' \
    | grep -v "common/types/platform/${base}" && echo "STRAY_REFS_${base}" || echo "OK_${base}"
done

bunx tsc --noEmit
bun run lint
git add -A
git commit -m "refactor(types): group platform/host types under common/types/platform"
```

### Step 7 — Move `agent/` (biggest blast, contains intra-dir dep; includes `hub.ts`)

**Files**: `agentModes.ts`, `assistantTypes.ts`, `detectedAgent.ts`, `hub.ts`, `remoteAgentTypes.ts`
**Consumer count**: 2 + 17 + 2 + 3 + 2 = 26

Intra-dep: `remoteAgentTypes.ts` → `@/common/types/detectedAgent`. After move both sit in `agent/`, so we have a choice:

- Keep alias form: `'@/common/types/agent/detectedAgent'` (matches current style inside that file)
- Switch to relative `'./detectedAgent'` (shorter, same-dir)

**Decision**: keep the alias form to minimize diff churn (only 1 line changes, still correct).

`agentModes.ts` imports from `codex/codexModes` (untouched). After move it becomes `../codex/codexModes` from sibling dir `agent/` — but since the original used alias `@/common/types/codex/codexModes`, no change required.

```bash
mkdir -p packages/desktop/src/common/types/agent
git mv packages/desktop/src/common/types/agentModes.ts       packages/desktop/src/common/types/agent/agentModes.ts
git mv packages/desktop/src/common/types/assistantTypes.ts   packages/desktop/src/common/types/agent/assistantTypes.ts
git mv packages/desktop/src/common/types/detectedAgent.ts    packages/desktop/src/common/types/agent/detectedAgent.ts
git mv packages/desktop/src/common/types/hub.ts              packages/desktop/src/common/types/agent/hub.ts
git mv packages/desktop/src/common/types/remoteAgentTypes.ts packages/desktop/src/common/types/agent/remoteAgentTypes.ts

# 7.1 Fix the intra-dir alias in remoteAgentTypes.ts (2 lines)
sed -i '' \
  -e "s|@/common/types/detectedAgent|@/common/types/agent/detectedAgent|g" \
  packages/desktop/src/common/types/agent/remoteAgentTypes.ts

# 7.2 Rewrite consumer imports — five passes
for base in agentModes assistantTypes detectedAgent hub remoteAgentTypes; do
  find packages/desktop/src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -exec sed -i '' \
      -e "s|@/common/types/${base}|@/common/types/agent/${base}|g" \
      -e "s|'../types/${base}'|'../types/agent/${base}'|g" \
      {} +
done

# 7.3 Stray reference sanity
for base in agentModes assistantTypes detectedAgent hub remoteAgentTypes; do
  grep -rn "common/types/${base}\b" packages/desktop/src/ --include='*.ts' --include='*.tsx' \
    | grep -v "common/types/agent/${base}" && echo "STRAY_REFS_${base}" || echo "OK_${base}"
done

bunx tsc --noEmit
bun run lint
git add -A
git commit -m "refactor(types): group agent-domain types under common/types/agent"
```

### Step 8 — Final directory-count verification

```bash
ls packages/desktop/src/common/types/
# Expected:
#   agent/  channel/  codex/  office/  platform/  provider/  team/
#   pptx2json.d.ts  turndown-plugin-gfm.d.ts
# = 7 subdirs + 2 files = 9 direct children ✅

# Confirm every subdir ≤ 10 children:
for d in agent channel codex office platform provider team; do
  echo "$d: $(ls packages/desktop/src/common/types/$d | wc -l)"
done
# Expected:
#   agent: 5    channel: 1    codex: 4 (unchanged)
#   office: 2   platform: 3   provider: 2    team: 2
```

### Step 9 — Format & smoke-test gate

```bash
bun run format                               # oxfmt
bunx tsc --noEmit && echo "TSC_OK"
bun run lint && echo "LINT_OK"
bun run test -- --run && echo "TEST_OK"      # full vitest suite
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
```

All four must succeed. If `prek` flags trailing whitespace / EOL issues, run auto-fix (`bun run format` / `bun run lint:fix`), amend into the **last** commit (local-only: `git commit --amend --no-edit` is fine since the branch hasn't been pushed), then re-run.

### Step 10 — Push

```bash
git push -u origin refactor/split-common-types
```

No PR to `main` — this branch targets `feat/backend-migration`. When ready:

```bash
gh pr create --base feat/backend-migration \
             --head refactor/split-common-types \
             --title "refactor(types): split common/types/ by domain" \
             --body "..."
```

## 6. Commit strategy

**6 commits (one per domain)** — chosen for review readability:

1. `refactor(types): group office domain under common/types/office`
2. `refactor(types): group team domain under common/types/team`
3. `refactor(types): group provider/speech types under common/types/provider`
4. `refactor(types): group channel types under common/types/channel`
5. `refactor(types): group platform/host types under common/types/platform`
6. `refactor(types): group agent-domain types under common/types/agent`

Each commit is **self-contained**: all moved files + all rewritten imports in a single atomic commit. Bisect-friendly (a broken commit leaves the tree green before and red after).

Alternative: squash into 1 commit at push time — acceptable but loses bisect granularity. Recommended to **keep 6 commits** unless team-lead prefers squash.

## 7. Rollback

### Locally (not pushed)

```bash
# Abort entire refactor
git reset --hard $(cat /tmp/fw3-baseline.sha)
git checkout feat/backend-migration
git branch -D refactor/split-common-types
```

### Pushed, not merged

```bash
git push origin --delete refactor/split-common-types
# Optionally reopen branch at baseline:
git checkout -b refactor/split-common-types $(cat /tmp/fw3-baseline.sha)
```

### Merged

A move-only refactor can always be reversed by a symmetric `git mv` in a follow-up PR. Since no type shapes changed, consumer code still works once imports are re-pointed to the new paths.

## 8. Tool pre-checks (run once before Step 1)

```bash
which bunx bun just prek                    # all must be on PATH
bun -v                                      # ensure a modern Bun
just push --help                            # verify just is the project version
```

If `prek` is missing:

```bash
npm install -g @j178/prek
```

## 9. Smoke test plan

After Step 9:

| Check          | Command                                                           | Expected                          |
| -------------- | ----------------------------------------------------------------- | --------------------------------- |
| TypeScript     | `bunx tsc --noEmit`                                               | exit 0, no errors                 |
| Lint           | `bun run lint`                                                    | exit 0                            |
| Format         | `bun run format`                                                  | no diff (`git diff --stat` empty) |
| Unit tests     | `bun run test -- --run`                                           | all pass                          |
| CI parity      | `prek run --from-ref origin/feat/backend-migration --to-ref HEAD` | no regressions                    |
| Directory cap  | `ls packages/desktop/src/common/types/ \| wc -l`                  | 9                                 |
| Per-subdir cap | loop in Step 8                                                    | each ≤ 10                         |

No runtime smoke tests needed — this is a pure compile-time refactor with zero behavior change.

## 10. Risks

| Risk                                                                                                      | Likelihood                                                                                                                   | Mitigation                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `sed` regex picks up an unintended path substring (e.g. `types/channel` matching `types/channel/channel`) | Medium                                                                                                                       | Every sed pass followed by grep stray-ref check in Steps 5/6/7. Trailing quote pattern (`types/channel'`) disambiguates. |
| Circular import introduced by moving `detectedAgent` and `remoteAgentTypes` apart                         | **Avoided by design**                                                                                                        | Both land in `agent/` — intra-dir dep preserved. No other file pair has an intra-types dep.                              |
| Ambient `.d.ts` stops being picked up after move                                                          | **Not applicable**                                                                                                           | `.d.ts` stays at root. `tsconfig.json` includes `packages/desktop/src/**/*` anyway.                                      |
| `codex/` accidentally modified                                                                            | **Explicit non-goal**, verified by `git diff --stat -- packages/desktop/src/common/types/codex/` being empty after all steps |                                                                                                                          |
| Import pattern not covered by sed (e.g. `from 'common/types/foo'` without the `@/` prefix)                | Low                                                                                                                          | grep before each sed pass enumerates all match patterns; visual inspection of the list catches unusual forms.            |
| Test file imports missed (tests live in `tests/` not `packages/`)                                         | Low                                                                                                                          | sed `find` root includes `tests scripts` explicitly.                                                                     |
| Branch accidentally targets `main`                                                                        | Low                                                                                                                          | `refactor/split-common-types` explicitly from `feat/backend-migration`; PR base is `feat/backend-migration`.             |

## 11. Open decisions (for team-lead)

> None are blockers — defaults chosen, flagged here for visibility.

1. **Ambient `.d.ts` placement**: default = keep at root (9/10 slots used). Alternative: move into `platform/` (→ 8 root children, `platform/` = 5). Recommendation: keep at root — ambient files don't fit the "platform" domain description.
2. **Barrel `index.ts`**: default = none. Adding one for each new subdir would let consumers write `@/common/types/agent` instead of `@/common/types/agent/assistantTypes`, but the codebase consistently imports specific files, not barrels. Adding barrels would be a separate concern.
3. **Commit granularity**: default = 6 per-domain commits. Squash if team-lead prefers.
4. **`platform/` naming**: alternative = `host/`. Recommendation: `platform/` matches the existing `platformType` / `platformUserId` vocabulary used in `channel.ts` and maps cleanly to "host-runtime contracts".

## 12. Estimated executor time

- Step 0 (baseline): 3 min
- Steps 2–7 (6 moves × ~5 min each: mv + sed + tsc + lint + commit): 30 min
- Step 9 (full smoke): 10–15 min (vitest + prek)
- Total: **~45–50 min** for a focused executor on a warm machine.

## 13. Future work (out of FW-3 scope)

- **`database.ts` rename to `messageSearch.ts`**: the file's current content is message-search payload only (`IMessageSearchItem`, `IMessageSearchResponse`) — the `database.ts` filename is misleading. We are **not** renaming it in FW-3 because file renames are out of scope (scope is "move + re-import", not "rename + re-import"). The file lands in `team/` because its strongest consumer is `ConversationSearchPopover` inside the team/conversation history flow. When a future PR adds other conversation-layer payload types, consider:
  1. Split a dedicated `conversation/` subdirectory, **or**
  2. Rename `team/database.ts` → `team/messageSearch.ts` (or move it into the new `conversation/`) with a matching `sed` pass on the 3 consumer files.

  Both follow-ups are straightforward once a second conversation-layer type appears.

- **`channel/` growth**: `channel/` holds a single file today. If no second channel-layer type materializes within 2-3 subsequent PRs, consider merging it back into a sibling or promoting its contents up; but given that N6/N7 is adding new channel plugins, expansion is likely.

## 14. Appendix — full consumer grep results

Generated 2026-05-12 from `feat/backend-migration@4feb8bb03`:

```
acpTypes (10 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/common/chat/chatLib.ts
  packages/desktop/src/common/config/configKeys.ts
  packages/desktop/src/common/config/storage.ts
  packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx
  packages/desktop/src/renderer/components/agent/AgentModeSelector.tsx
  packages/desktop/src/renderer/pages/conversation/utils/createConversationParams.ts
  packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx
  packages/desktop/src/renderer/pages/guid/types.ts
  packages/desktop/src/renderer/pages/settings/AgentSettings/InlineAgentEditor.tsx

agentModes (2 consumers):
  packages/desktop/src/renderer/utils/model/agentModes.ts
  tests/e2e/specs/conversation-full-cycle.e2e.ts

assistantTypes (17 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/process/utils/migrateAssistants.ts
  packages/desktop/src/renderer/hooks/agent/usePresetAssistantInfo.ts
  packages/desktop/src/renderer/hooks/assistant/useAssistantEditor.ts
  packages/desktop/src/renderer/hooks/assistant/useAssistantList.ts
  packages/desktop/src/renderer/pages/conversation/hooks/useConversationAgents.ts
  packages/desktop/src/renderer/pages/conversation/utils/createConversationParams.ts
  packages/desktop/src/renderer/pages/guid/components/AssistantSelectionArea.tsx
  packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx
  packages/desktop/src/renderer/pages/guid/components/PresetAgentTag.tsx
  packages/desktop/src/renderer/pages/guid/hooks/useCustomAgentsLoader.ts
  packages/desktop/src/renderer/pages/guid/hooks/useGuidAgentSelection.ts
  packages/desktop/src/renderer/pages/guid/hooks/usePresetAssistantResolver.ts
  packages/desktop/src/renderer/pages/settings/AgentSettings/PresetManagement.tsx
  packages/desktop/src/renderer/pages/settings/AssistantSettings/types.ts
  packages/desktop/src/renderer/pages/team/components/agentSelectUtils.tsx
  tests/unit/assistants/useAssistantList.dom.test.ts

channel (7 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/DingTalkConfigForm.tsx
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/LarkConfigForm.tsx
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/TelegramConfigForm.tsx
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/WecomConfigForm.tsx
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx

conversion (1 consumer):
  packages/desktop/src/common/adapter/ipcBridge.ts  (dynamic import())

database (3 consumers):
  packages/desktop/src/common/adapter/searchMapper.ts
  packages/desktop/src/process/services/database/IConversationRepository.ts
  packages/desktop/src/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover.tsx

detectedAgent (2 external + 1 intra):
  packages/desktop/src/common/types/remoteAgentTypes.ts  (intra-dir, see Step 7)
  packages/desktop/src/renderer/pages/team/components/TeamChatEmptyState.tsx

electron (1 consumer):
  packages/desktop/src/common/adapter/browser.ts

fileSnapshot (3 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx
  packages/desktop/src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts

hub (3 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/renderer/hooks/agent/useHubAgents.ts
  packages/desktop/src/renderer/pages/settings/AgentSettings/AgentHubModal.tsx

preview (12 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/common/chat/navigation/NavigationInterceptor.ts
  packages/desktop/src/renderer/hooks/file/usePreviewLauncher.ts
  packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewHistoryDropdown.tsx
  packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar.tsx
  packages/desktop/src/renderer/pages/conversation/Preview/context/PreviewContext.tsx
  packages/desktop/src/renderer/pages/conversation/Preview/fileUtils.ts
  packages/desktop/src/renderer/pages/conversation/Preview/hooks/usePreviewHistory.ts
  packages/desktop/src/renderer/pages/conversation/Preview/types.ts
  packages/desktop/src/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps.ts
  packages/desktop/src/renderer/utils/emitter.ts
  packages/desktop/src/renderer/utils/file/fileType.ts

providerApi (2 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/common/config/configMigration.ts

remoteAgentTypes (2 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx

speech (5 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/common/config/configKeys.ts
  packages/desktop/src/common/config/storage.ts
  packages/desktop/src/renderer/components/settings/SettingsModal/contents/ToolsModalContent.tsx
  packages/desktop/src/renderer/services/SpeechToTextService.ts

teamTypes (10 consumers):
  packages/desktop/src/common/adapter/ipcBridge.ts
  packages/desktop/src/common/adapter/teamMapper.ts
  packages/desktop/src/renderer/pages/team/components/AgentStatusBadge.tsx
  packages/desktop/src/renderer/pages/team/components/TeamCreateModal.tsx
  packages/desktop/src/renderer/pages/team/components/TeamTabs.tsx
  packages/desktop/src/renderer/pages/team/hooks/TeamTabsContext.tsx
  packages/desktop/src/renderer/pages/team/hooks/useSiderTeamBadges.ts
  packages/desktop/src/renderer/pages/team/hooks/useTeamList.ts
  packages/desktop/src/renderer/pages/team/hooks/useTeamSession.ts
  packages/desktop/src/renderer/pages/team/TeamPage.tsx
```
