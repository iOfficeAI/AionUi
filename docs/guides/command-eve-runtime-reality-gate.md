# Command EVE Runtime Reality Gate

Status: active gate
Date: 2026-06-10
Scope: Command EVE desktop runtime, AionUI surface, Hermes ACP, local and cloud model egress.

## Why This Exists

Command EVE must not promote a feature to Done because a sidecar unit test,
Markdown report, or isolated harness passed. Done requires evidence from the
live product path:

```text
AionUI GUI -> Hermes ACP -> egress policy/proxy -> model provider -> receipt/log
```

If a feature only runs in a script, Node sidecar, bootstrap preflight, or proof
doc, its honest status is built-in-dev-layer or product-enforcement-unproven.

## Current Product Truth

- Command EVE now ships a real macOS app artifact in this worktree.
- The local runtime uses Hermes 0.16.0 through ACP.
- Hermes 0.16.0 rejects model context windows below 64k in the normal ACP path.
- The local default is therefore `custom:command-eve-gemma4-e4b-64k:latest`.
- The observed slow chat is not a deadlock: the verified product path has taken
  roughly 49s for a small local 64k Gemma E4B response.
- A 32k local model can only be used in a separate quick lane or a Hermes fork,
  not as the default Hermes ACP path.

## Gate Rules

1. UI/UX claims must be verified in the real Electron/AionUI surface.
2. Runtime claims must produce a receipt or log path.
3. Boundary claims must include an input that should be blocked, transformed, or
   allowed, plus the exact policy receipt.
4. Cloud lanes are not accepted until their egress path is gated as strictly as
   the local lane.
5. Voice is not accepted until microphone capture, transport, model path, and
   playback are all real.
6. Dogfood is not accepted until EVE can be used to continue building EVE from
   the app itself.

## Execution Mode Split

Command EVE separates capability gates from truth gates. Capability gates
control how much autonomy a worker/runtime may take. Truth gates prove whether
the product path is actually correct. Stronger inference does not remove truth
gates.

Mode matrix:

| Mode | Meaning | Reversible work | Main merge | Irreversible work |
|---|---|---|---|---|
| `observed` | Founder watches live and can stop immediately. | allowed | founder click | HG-4 |
| `delegated` | Founder authorized the run but does not watch every step. | allowed | HG-2.5 | HG-4 |
| `autonomous` | Nobody watches; 14-day-offline path. | gated | HG-2.5 + CAO | HG-4 |

Truth gates run in all modes. A red truth gate blocks promotion regardless of
mode. The current implementation exposes the policy core in
`packages/desktop/src/process/commandEve/executionModeCore.ts`; runtime
decisions must be logged as local JSONL receipts before DELEGATED/AUTONOMOUS
dispatch is considered product-ready.

Pragmatic rule for live development: `observed` may be used while Mathias is
watching, even before all automated truth gates are complete. It only relaxes
reversible work ceremony. It does not relax prod writes, money, external sends,
schema/auth/secret changes, public release claims, or truth-gate evidence.

## Hard Keystone Tests

### K1: Local GUI Live E2E

Drive the real app, type a short prompt into the real chat, wait for Hermes, and
assert a real response plus a runtime receipt/log.

Acceptance:

- The test starts or attaches to the packaged app.
- The prompt is entered through the real message box.
- The selected assistant is EVE.
- The selected backend is Hermes.
- The selected model is `custom:command-eve-gemma4-e4b-64k:latest` or a newer
  evidence-backed default.
- The receipt records model, backend, elapsed time, and response state.

### K2: Local Secret and PII Boundary

Drive the real app, type a synthetic secret and German PII into the real chat,
and assert a boundary receipt.

Acceptance:

- The raw sensitive input does not reach a disallowed provider.
- The UI reports the policy action to the user.
- The receipt names the rule, decision, backend, and provider.

### K3: Cloud Egress Boundary

Repeat K2 with every cloud lane enabled in settings.

Acceptance:

- Cloud forwarding is impossible without an allow/transform decision.
- User override decisions are explicit and logged.
- A provider-specific failure fails closed.

### K5: Real Author/Critic Separation

Run an independent cross-family reviewer on the committed diff or artifact set.

Acceptance:

- The verifier is not the same model family/session that authored the changes.
- Findings are persisted as a report path or review receipt.
- A PASS cannot be generated from string-matching role labels; it must cite
  inspected files, commands, or product evidence.

### K6: Real No-Bypass Tripwire

Instrument the real build, dispatch, inference, and egress entry points.

Acceptance:

- Direct bypasses around the Command EVE egress proxy are detected in runtime.
- Curated allowlist string matches are not accepted as proof.
- The receipt names the entry point, decision, mode, and blocking rule.

### K4: Local Model Latency Budget

Run the model benchmark before changing default model/provider strategy.

Acceptance:

- `npm run command-eve:bench:models -- --samples 3` writes a JSON receipt.
- Ollama native, Command EVE OpenAI shim, and optional MLX-compatible servers
  can be compared with the same prompt and context size.
- Any switch to MLX, cloud, or a quick lane is backed by measured first-token
  and total latency.

## Speed Strategy

The default Hermes ACP lane stays 64k until a safer path is proven. Speed work
should happen in this order:

1. Measure the existing Ollama and OpenAI-shim lanes.
2. Compare an OpenAI-compatible MLX server if available.
3. Reduce always-loaded prompt/context before changing core runtime semantics.
4. Add a separate L1 quick lane for status, classification, and short replies.
5. Keep L2 planning/orchestration on the gated Hermes path.

## Release Rule

A release may include partial work, but the release note must say so. The words
Done, fixed, enforced, or autonomous require the relevant live-product gate
above to pass with a committed or archived receipt.
