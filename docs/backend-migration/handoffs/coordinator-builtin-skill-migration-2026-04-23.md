# Coordinator Handoff — Built-in Skill Migration — 2026-04-23

**Coordinator branch (AionUi):** `feat/backend-migration-coordinator` — this commit
**Feature branch (AionUi):** `feat/backend-migration-builtin-skills` @ `ff5290db5`
**Feature branch (aionui-backend):** `feat/builtin-skills` @ `04f1537`
**Base branches:** AionUi feat ← `feat/backend-migration-coordinator`; aionui-backend feat ← `feat/assistant-user-data`
**PRs:** Per user instruction — **none raised**. Branches pushed for user inspection.

## What shipped

Moved built-in skill resources from `AionUi/src/process/resources/skills/` into the Rust backend, embedded via `include_dir!`, renamed `_builtin/` → `auto-inject/`, routed every consumer through HTTP (`AcpSkillManager` + `initAgent`), and introduced two backend endpoints (`materialize-for-agent` / cleanup) that serve gemini CLI's filesystem needs without any frontend file I/O.

### Role deliverables

| Role         | Final SHA                  | Deliverable                                                                                                                                                                                                         |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| coordinator  | this commit                | spec, plan, 2 hotfixes routed, merge, module log, handoff                                                                                                                                                           |
| backend-dev  | `04f1537` (aionui-backend) | T1 + H1: corpus import, include_dir embed, rename, `materialize-for-agent` + cleanup + orphan sweep, camelCase audit of skill.rs (3 → 21 rename_all), 27 new Rust tests                                             |
| frontend-dev | `2e2bda33d` (AionUi)       | T2: delete `resources/skills/`, `AcpSkillManager` HTTP, `initAgent.setupAssistantWorkspace` materialize hook, GeminiAgentManager + ConversationServiceImpl cleanup hooks, initStorage legacy cleanup, 11 new Vitest |
| e2e-tester   | `ff5290db5` (AionUi)       | T3: 8-scenario Playwright suite + report (run-1 → 5/8 found D1/D2/D3; run-2 post-H1 → 8/8 in 13.5s)                                                                                                                 |

### Final endpoints (summary)

| Method | Path                                     | Behavior                                                                                                                                                                                                                  |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/skills/builtin-auto`               | Auto-inject skills with `{name, description, location: "auto-inject/{name}/SKILL.md"}` — NEW `location` field                                                                                                             |
| POST   | `/api/skills/builtin-skill`              | Read skill body by relative path (`auto-inject/.../SKILL.md` or `{name}/SKILL.md`); `fileName` camelCase enforced                                                                                                         |
| GET    | `/api/skills`                            | Merged list; `source=builtin` rows carry NEW `relativeLocation` (for HTTP body reads) + stable `location` (for SkillsHubSettings export-symlink flow — synthesized absolute path under `{data_dir}/builtin-skills-view/`) |
| POST   | `/api/skills/materialize-for-agent`      | Write conversation skill bundle to `{data_dir}/agent-skills/{conversationId}/`, flat `{name}/SKILL.md` layout; auto-inject unconditional, opt-in overwrites on collision                                                  |
| DELETE | `/api/skills/materialize-for-agent/{id}` | Idempotent cleanup                                                                                                                                                                                                        |

## Verdict

**SUCCESS.**

All planned tasks (T0–T4) + one in-flight hotfix (H1) landed clean. T3 8/8 green. Packaging smoke (coordinator manual step T4.2) passes against a release binary placed in a temp dir with **no sibling assets/** — proving the core motivation (assistant H2-class packaging robustness) is met.

**Packaging smoke transcript (T4.2):** Tested by copying `target/release/aionui-backend` alone to a fresh `mktemp -d` with no `assets/` sibling, launching with `--local --data-dir {tmp}/data`, and hitting four key endpoints — all return expected responses. The binary carries its skill corpus internally.

## In-flight hotfix — context

**H1** (04f1537): Serde camelCase audit. T3 run-1 found `aionui-api-types/src/skill.rs` had only 3 of 22 derive blocks with `rename_all = "camelCase"`. D1 (`ReadBuiltinResourceRequest`) broke `fileName` acceptance end-to-end; D2 (`SkillListItemResponse`) broke `relativeLocation` on the wire. Backend-dev fixed all 16 missing public types at once plus added regression-guard tests that reject legacy snake-case payloads. Lesson: schema-level conventions (AGENTS.md §API) warrant a linter, not reactive hotfixes — captured in followups below.

## Lessons captured

Appended to `docs/backend-migration/notes/team-operations-playbook.md` (new §):

1. **`stat -f` on a symlink reports link mtime, not target mtime.** For freshness checks of `~/.cargo/bin/aionui-backend` (itself a symlink per workflow doc §2), use `stat -L` or `readlink` + `stat` on the resolved target, or `ls -laL`. Surfaced by e2e-tester during T3 rerun.
2. **camelCase on the wire is an API-wide invariant and needs a lint, not reactive hotfixes.** Review caught 2 of the 19 violations; e2e caught the rest via symptom. A project-wide grep for public `#[derive(..., Serialize/Deserialize, ...)]` without `rename_all` would flag these pre-merge.
3. **Packaging smoke is worth its own acceptance step** — the whole motivation of embedding resources only meaningfully pays off in "the binary has no sibling" environment. Synthesizing that with `mktemp + mv binary` is fast (~2 min) and should be a standard step for any pilot touching asset delivery.

## Followups (not blocking this pilot)

1. **Pre-existing `cargo clippy --workspace -- -D warnings` debt** in aionui-office/snapshot.rs, aionui-api-types/conversation.rs + lifecycle.rs, aionui-realtime/handler_integration.rs, aionui-extension/tests/registry_test.rs — red on the base branch before this pilot. Dedicated clippy sweep warranted.
2. **`cargo test --workspace` pre-existing failure** `extension_e2e::cp1_get_external_paths_empty` — dev-box env dependency (real `~/.claude/skills` pollutes the test). Sandbox the test path.
3. **Linter for missing `rename_all = "camelCase"`** on public `api-types` structs (see Lessons §2). Small clippy-style check or a test that serializes every public struct and asserts no snake-case field names.
4. **`SkillInfo.location` for builtin is now synthesized as `{data_dir}/builtin-skills-view/{name}/SKILL.md`** with lazy materialization. Audit: does `export-symlink` actually use this path today, or only `relativeLocation`? If the lazy-materialize path is dead code post-H5-frontend-audit, simplify.
5. **GeminiAgentManager.kill + ConversationServiceImpl.deleteConversation both call cleanup**. If a conversation is deleted while a gemini process is still running, order-of-ops matters. Consider centralizing cleanup in one place.

## Branch tips at closure

| Branch                                  | Repo           | SHA                                                                 |
| --------------------------------------- | -------------- | ------------------------------------------------------------------- |
| `feat/backend-migration-coordinator`    | AionUi         | this commit (merged feature back + this handoff + playbook updates) |
| `feat/backend-migration-builtin-skills` | AionUi         | `ff5290db5`                                                         |
| `feat/builtin-skills`                   | aionui-backend | `04f1537`                                                           |

Per user instruction, **no PRs are raised**. Merging feature branches to main is out of scope of this pilot.
