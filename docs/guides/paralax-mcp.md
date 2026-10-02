# PARALAX MCP

[PARALAX MCP](https://github.com/amiencoy/paralax-mcp) is a policy-gated context gateway for carrying a bounded, reviewed context capsule between AI runtimes. AionUi can connect to it through the existing MCP server manager; no AionUi plugin or runtime patch is required.

> PARALAX does not grant a model unrestricted access to your machine. Its Axionorm policy, active bond, lease, audience, and path allowlist remain authoritative for every tool call.

## Prerequisites

- AionUi installed and running.
- PARALAX MCP installed with its Python virtual environment.
- A generated PARALAX desktop profile and an active bond.
- The absolute path to the generated `gateway.json` file.

See the [PARALAX installation guide](https://github.com/amiencoy/paralax-mcp/blob/main/docs/INSTALLATION.md) for the current bootstrap and bond workflow.

## Generate a desktop profile

From the PARALAX checkout, generate a profile for the context you want to expose:

```bash
paralax-setup desktop \
  --runtime-dir runtime/aionui \
  --policy runtime/policy.yaml \
  --context-dir /absolute/path/to/reviewed-context \
  --artifacts-dir /absolute/path/to/create-only-artifacts
```

The generated directory contains an MCP configuration and `gateway.json`. Keep generated policies, keys, databases, exported context, and review artifacts outside source control.

## Import the server into AionUi

1. Open **Settings → Tools → MCP Servers**.
2. Choose the JSON import option.
3. Import the `paralax-gateway` entry from the generated MCP configuration.
4. Confirm that the server starts successfully.
5. Enable `paralax-gateway` for the conversation that should receive the governed context.

A generated entry uses the standard stdio MCP shape that AionUi already accepts:

```json
{
  "mcpServers": {
    "paralax-gateway": {
      "command": "/absolute/path/to/paralax/venv/bin/python",
      "args": [
        "-m",
        "paralax_mcp.run",
        "--config",
        "/absolute/path/to/runtime/aionui/gateway.json"
      ]
    }
  }
}
```

Use absolute paths. The Python executable must come from the PARALAX environment that contains `paralax_mcp` and its sibling protocol dependencies.

## Windows with PARALAX in WSL

When AionUi runs on Windows and PARALAX runs inside WSL, invoke the server through `wsl.exe`:

```json
{
  "mcpServers": {
    "paralax-gateway": {
      "command": "wsl.exe",
      "args": [
        "--distribution",
        "Ubuntu",
        "--",
        "/home/you/paralax/venv/bin/python",
        "-m",
        "paralax_mcp.run",
        "--config",
        "/home/you/paralax/runtime/aionui/gateway.json"
      ]
    }
  }
}
```

Replace `Ubuntu` and all Linux paths with the distribution and paths used by your installation. Keep the gateway process, its configuration, and the allowed context paths in the same environment.

## Verify the boundary

If your PARALAX version exposes `gateway_describe`, call it before reading context. It returns the active contract—audience, purpose, lease, policy digest, allowed tools, and non-promoting return behavior—without revealing host paths.

Then verify only the minimum capability you intend to use:

1. Confirm `context_read` returns reviewed files inside the configured context root.
2. Confirm a traversal or out-of-scope path is denied.
3. If artifact writes are enabled, confirm they are create-only and land inside the configured artifacts root.
4. Revoke or expire the bond and confirm later calls fail closed.

Outputs returned through PARALAX are proposals for review. They are not automatically promoted into authoritative memory or source state.

## Troubleshooting

- **Server does not start:** re-check the absolute Python and `gateway.json` paths, then run the same command in a terminal to see the startup error.
- **`No module named paralax_mcp`:** the selected Python executable is not the PARALAX virtual environment.
- **Calls are denied:** inspect the active Axionorm policy, bond audience, purpose, lease, labels, and allowed tools.
- **Windows path errors:** use the WSL wrapper above instead of mixing Windows paths with a Linux Python process.
- **Tool is missing:** regenerate the desktop profile after updating PARALAX, then re-import or refresh the server in AionUi.
