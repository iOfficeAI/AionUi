# Department WebUI with Local SGLang

This guide describes the productized AionUi fork profile for a department WebUI service backed by a local SGLang OpenAI-compatible endpoint.

## Defaults in this fork

- Default model provider in Settings -> Model is `SGLang`.
- Provider base URL is `http://10.2.9.105:30000/v1`.
- Provider protocol is OpenAI-compatible chat completions.
- The API key field is prefilled with `local-sglang` because many local SGLang deployments only require a non-empty bearer token. Replace it if the serving endpoint enforces a real token.
- The model field is prefilled with `/models/google/gemma-4-31B-it-FP8-block`, the model id currently returned by `/v1/models`.

## SGLang preflight

Run these checks from the AionUi host before exposing WebUI to users:

```bash
curl http://10.2.9.105:30000/v1/models
curl http://10.2.9.105:30000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-sglang' \
  -d '{"model":"/models/google/gemma-4-31B-it-FP8-block","messages":[{"role":"user","content":"ping"}],"stream":false}'
```

Expected result:

- `/v1/models` returns at least one model id.
- `/v1/chat/completions` returns an assistant message.
- If the server requires a token, update the provider API key in AionUi before saving.

## WebUI service posture

Use WebUI as the department entry point rather than installing desktop clients for every user.

Recommended baseline:

- Run AionUi WebUI on an internal host that can reach `10.2.9.105:30000`.
- Bind WebUI only to the department network or place it behind an internal firewall rule.
- Set or reset the WebUI password with `bun run resetpass` or the packaged equivalent before users connect.
- Keep the AionUi working directory scoped to a department workspace, not a broad home directory.
- Back up the AionUi data directory before changing provider settings or upgrading the fork.

Start from source during validation:

```bash
bun run webui:prod:remote
```

For packaged/headless deployment, follow `docs/guides/deploy-server.md` and set the service `WORKDIR` to the department workspace directory.

## Document automation assistant setup

Create a user assistant for the department instead of modifying built-in assistants in this frontend repo. Built-in assistant manifests are owned by the backend asset bundle.

Suggested assistant profile:

- Name: `Department Document Automation`
- Model provider: `SGLang`
- Model: the model id returned by `/v1/models`
- Primary tasks: summarize long source documents, rewrite reports, draft Word/PPT/Markdown outputs, analyze CSV or Excel files, and prepare executive summaries.
- Safety rule: read and draft freely, but ask before writing, overwriting, deleting, moving files, or running commands.
- Workspace rule: operate only inside the configured department workspace unless the user explicitly attaches files.

Suggested system rules:

```text
You are the department document automation agent. Use the local SGLang model through the configured OpenAI-compatible provider. Prefer structured plans for long documents. Preserve source facts and cite filenames when summarizing uploaded or workspace files. Create draft files only after the user approves the intended output path and format. Never delete, overwrite, move, or execute commands without explicit confirmation.
```

## Acceptance checklist

- WebUI is reachable only from the intended internal network.
- WebUI password is set and known to the service owner.
- Settings -> Model opens with `SGLang` selected for new provider creation.
- The provider saves with `http://10.2.9.105:30000/v1` and `/models/google/gemma-4-31B-it-FP8-block` unless the operator changes it.
- A health check succeeds for the selected model.
- A long document summary succeeds from the department workspace.
- File write/delete/command actions are approved by the user before execution.

## Future gateway option

Add an OpenAI-compatible gateway between AionUi and SGLang when the department needs centralized auth, request logging, model aliases, rate limits, or per-team policy. Until then, the fork calls SGLang directly.
