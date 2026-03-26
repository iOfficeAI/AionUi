# Design: Hook Capability Absorption Plan

**Date:** 2026-03-26
**Status:** Proposed

## Background

ContextGo already ships the first productized assistant hook foundation:

- assistant-level hook selection and storage
- builtin hook distribution and installation
- `before_user_prompt` prompt-transform execution in the main-process send pipeline

That foundation is enough to absorb a meaningful subset of high-value hook ideas from
`oh-my-claudecode`, but not its full runtime model yet.

The external review also confirms the right framing:

- `oh-my-claudecode` is a strong orchestration and plugin layer, not a standalone base runtime
- its hook surface is much broader than the current ContextGo runtime
- the most practical path is selective absorption, not architecture cloning

## Problem

The current ContextGo hook product is useful but still narrow.

Today it can:

- persist hook metadata
- install builtin hooks
- execute prompt-transform hooks for `before_user_prompt`

Today it cannot yet:

- react to tool lifecycle events
- validate runtime claims after execution
- intercept permission requests
- track subagent lifecycle
- perform compaction-time memory maintenance

As a result, many of the strongest ideas from `oh-my-claudecode` are only partially portable right
now.

## Goal

Define a practical plan for absorbing high-value hook capabilities from
`/Users/bytedance/project/oh-my-claudecode` into ContextGo without overextending the current runtime.

The plan should:

- prioritize capabilities that fit the current `before_user_prompt` execution model
- identify which features require runtime event expansion first
- preserve a path toward stronger hook governance later
- improve real user outcomes for repository understanding, instruction injection, and session quality

## Non-Goals

This plan does not propose:

- cloning the full `oh-my-claudecode` orchestration model
- introducing tmux-worker style coordination
- implementing every Claude-style hook event in one iteration
- shipping policy-heavy automation before ContextGo has enough execution evidence

## Current Runtime Boundary

ContextGo currently executes only `before_user_prompt` prompt-transform hooks.
Other event metadata can be stored, but it is not executed yet.

That boundary should drive the absorption strategy.

A capability is a good near-term candidate only if it can be expressed as one of the following:

- prompt enrichment before the user prompt is sent
- session-start style context registration that can be simulated or added cheaply
- lightweight workspace inspection that does not require tool execution interception

## What To Absorb Now

These capabilities are strongly aligned with the current product shape and should be implemented
first.

### 1. Task Size Detector

Source idea:

- `src/hooks/task-size-detector/index.ts` in `oh-my-claudecode`

Why it fits now:

- it only needs the user prompt
- it is deterministic and cheap
- it prevents over-instruction for trivial tasks

Recommended ContextGo adaptation:

- classify prompts as `small`, `medium`, or `large`
- expose the result to prompt-transform hooks through template variables or a small context object
- let builtin hooks change behavior based on task size

Expected benefit:

- reduces prompt noise for small tasks
- gives future hook stacks a simple gating primitive

### 2. Rules Injector

Source idea:

- `src/hooks/rules-injector/index.ts` in `oh-my-claudecode`

Why it fits now:

- ContextGo is already workspace-centric
- file and directory context is available before model dispatch
- injecting matching rule files is naturally a prompt-side concern

Recommended ContextGo adaptation:

- resolve relevant rule files based on the active workspace and referenced file paths
- support nearest-project rule discovery first
- deduplicate by path and content
- inject only matched rules, not all rules

Expected benefit:

- tighter repo-specific compliance
- lower chance of the agent ignoring local conventions

### 3. Directory README / AGENTS Injector

Source idea:

- `src/hooks/directory-readme-injector/index.ts` in `oh-my-claudecode`

Why it fits now:

- it is a contextual prompt-enrichment mechanism
- it aligns with existing `AGENTS.md` expectations in developer tooling
- it is especially useful in monorepos and modular repositories

Recommended ContextGo adaptation:

- when a prompt or working set references files, walk upward for nearest `README.md` and `AGENTS.md`
- inject the closest relevant documents first
- cap injected size and mark truncation explicitly
- cache per session to avoid repeated reinjection

Expected benefit:

- stronger local-context awareness
- better handling of large, multi-module projects

### 4. Project Memory Lite

Source idea:

- `src/hooks/project-memory/index.ts` in `oh-my-claudecode`

Why it fits now:

- ContextGo already values user input, transcript context, and future analysis-ready data
- project-environment summaries can be generated without tool lifecycle hooks
- this is highly complementary to external session takeover

Recommended ContextGo adaptation:

- detect project root, languages, frameworks, package manager, build command, test command
- persist a lightweight project summary
- inject the summary once per session or refresh on demand
- reserve richer learning and hot-path tracking for later phases

Expected benefit:

- faster repo grounding for new and taken-over sessions
- cleaner future path for scheduled analysis of user activity and project context

### 5. Lightweight Intent Keywords

Source idea:

- `src/hooks/keyword-detector/index.ts`
- `src/features/magic-keywords.ts`

Why it fits now:

- keyword detection can remain prompt-side
- some intent overlays are useful even without multi-agent orchestration

Recommended ContextGo adaptation:

- only absorb a narrow set of intent keywords:
  - `review`
  - `tdd`
  - `analyze`
  - `ultrathink`
- map them to prompt overlays, not to orchestration modes
- explicitly avoid importing OMC-specific worker-routing semantics such as autopilot and team mode

Expected benefit:

- better intent fidelity from short prompts
- lower product complexity than full orchestration mode cloning

## What To Defer

These capabilities are valuable, but they should wait until ContextGo has a broader runtime event
surface.

### 1. Comment Checker

Reason to defer:

- it depends on awareness of file writes and edits
- it is much more effective as a `PreToolUse` or `PostToolUse` guard than as pure prompt advice

### 2. Factcheck Guard

Reason to defer:

- it needs claims, command history, path evidence, and cwd parity checks
- prompt-only emulation would look rigorous but would not be trustworthy

### 3. Permission Handler

Reason to defer:

- it requires a permission request interception point
- current ContextGo hook runtime does not expose that event

### 4. Subagent Tracker and Deliverable Verification

Reason to defer:

- it requires subagent lifecycle visibility
- it only becomes meaningful when ContextGo exposes multi-agent runtime events consistently

### 5. Pre-Compact and Recovery Hooks

Reason to defer:

- these depend on conversation compaction and failure lifecycle
- they should be built after core session and tool events are normalized

## Runtime Expansion Required Later

To unlock the deferred capability set, ContextGo should add a broader normalized hook runtime.

Recommended next event surface:

- `session_start`
- `before_user_prompt`
- `after_user_prompt`
- `before_tool_use`
- `after_tool_use`
- `permission_request`
- `before_response`
- `after_response`
- `session_end`

This event list is intentionally smaller than the full `oh-my-claudecode` surface, but it is large
enough to support most practical governance and context features.

## Delivery Plan

### Phase 1. Context Injection Upgrade

Implement:

- task size detector
- rules injector
- directory README / `AGENTS.md` injector
- project memory lite

Success criteria:

- all four capabilities can run without tool lifecycle hooks
- context injection is deduplicated and size-bounded
- sessions show measurably better repository grounding with no extra user steps

### Phase 2. Intent Overlay Upgrade

Implement:

- lightweight keyword detector
- prompt overlays for `review`, `tdd`, `analyze`, and `ultrathink`

Success criteria:

- the feature works as prompt enhancement only
- no OMC-specific orchestration concepts leak into the product model
- short user prompts become more predictable without large prompt inflation

### Phase 3. Runtime Event Expansion

Implement:

- normalized hook runtime with session and tool lifecycle events
- event payload contracts and compatibility rules
- internal diagnostics for hook execution order and failures

Success criteria:

- non-prompt hooks have a stable event substrate
- failures are observable without breaking message delivery
- compatibility expectations are explicit in hook manifests

### Phase 4. Governance Hooks

Implement:

- comment checker
- factcheck guard
- permission-aware policy hooks
- subagent and deliverable verification hooks

Success criteria:

- governance hooks operate on real execution evidence
- the product can explain why a hook fired and what evidence it used
- policy hooks do not rely on unverifiable prompt-only inference

## Product Principles

The absorption work should follow these rules.

### 1. Do Not Clone OMC Mode Semantics

ContextGo should reuse good capability patterns, not inherit OMC-specific product vocabulary such as:

- `autopilot`
- `ralph`
- `ultrawork`
- team-mode orchestration contracts

Those semantics are tightly coupled to OMC's own execution model.

### 2. Prefer Evidence Over Prompt Theater

If a capability depends on actual execution traces, do not imitate it with prompt-only wording.

Prompt-only approximations are acceptable for:

- instruction injection
- contextual guidance
- intent signaling

They are not acceptable for:

- claim verification
- permission enforcement
- post-edit quality assertions

### 3. Keep Hook Categories Clear

ContextGo should distinguish at least three product categories over time:

- context hooks
- intent hooks
- governance hooks

This reduces confusion in both settings UI and future analytics.

### 4. Treat Hook Output as First-Class Context Data

Hook-derived context should be structured enough to support future analysis jobs.

That includes:

- injection source
- session scope
- workspace scope
- dedupe identity
- execution timing

## Open Questions

These questions should be resolved during implementation planning, not blocked at the strategy level.

- How should referenced file paths be extracted from the current send pipeline reliably?
- Should project memory be per workspace root, per assistant, or both?
- Should builtin hooks be grouped by category in the settings UI before Phase 3?
- How much hook execution telemetry should be visible to end users versus only logs?

## Recommendation

The recommended near-term roadmap is:

1. absorb the context-enrichment set first
2. add lightweight intent overlays second
3. expand the runtime event surface third
4. bring in governance hooks only after real execution evidence exists

This gives ContextGo immediate user value while preserving a clean path toward a more complete hook
platform later.
