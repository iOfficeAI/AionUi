# @chisl/chisl-opencode-plugin

OpenCode control-plane plugin for Chisl. The plugin connects back to an
[AionCore](https://github.com/ioffice-ai/aioncore) instance and:

- Forwards tool lifecycle and other lifecycle events to AionCore for audit.
- Receives dynamic `system` prompt context updates from AionCore and injects
  them into the chat (via `experimental.chat.system.transform`, with a
  defensive `chat.message` fallback that appends a synthetic `TextPart`).
- Exposes a `run_shell_streaming` tool that streams shell output to AionCore
  and back to the host.

## Install / register

In your OpenCode `opencode.json`:

```jsonc
{
  "plugin": [
    [
      "@chisl/chisl-opencode-plugin",
      {
        // Optional — env vars AIONCORE_URL / AIONCORE_TOKEN are also read.
        "url": "https://aioncore.example.com",
        "token": "sk_...",
      },
    ],
  ],
}
```

## Configuration

The plugin resolves its AionCore base URL and bearer token in this order:

1. The `url` / `token` keys passed via the plugin options object.
2. The environment variables `AIONCORE_URL` / `AIONCORE_TOKEN`.

If neither is set the plugin loads in **no-op mode**: it still registers all
hooks (so it cannot break the host), prints a single `console.warn`, and
disables all forwarding / context injection. The `run_shell_streaming` tool
remains registered but will return an error explaining that the plugin is
not configured.

## License

Apache-2.0.
