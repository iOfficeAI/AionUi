# AgentUi Lite Startup Design

## Goal

AgentUi should keep AionUi's power-user features, but default to a leaner startup profile for daily use. Expensive or network-facing features should start only when the user enables them, invokes them, or opts in through environment variables.

## Recommended Approach

Use a lightweight runtime profile instead of deleting features. This keeps the fork easy to rebase against upstream while giving the fork its own efficiency-focused defaults.

## Startup Defaults

- Disable automatic update checks unless explicitly enabled.
- Do not auto-restore desktop WebUI on startup unless explicitly enabled.
- Do not run agent detection immediately on desktop startup unless explicitly enabled.
- Keep desktop pet opt-in through the existing preference.
- Keep extensions and channel integrations available, but allow Lite mode to skip their startup initialization.
- Keep shell environment loading asynchronous, but allow Lite mode to skip it when the user wants the fastest startup.

## Configuration

The default fork profile is Lite. Users can opt back into heavier startup work through environment variables:

- `AGENTUI_LITE=0` disables Lite defaults.
- `AGENTUI_AUTO_UPDATE=1` enables startup update checks.
- `AGENTUI_STARTUP_AGENT_DETECTION=1` enables desktop startup agent detection.
- `AGENTUI_RESTORE_WEBUI=1` enables desktop WebUI auto-restore.
- `AGENTUI_STARTUP_EXTENSIONS=1` enables extension registry startup initialization.
- `AGENTUI_STARTUP_CHANNELS=1` enables channel subsystem startup initialization.
- `AGENTUI_LOAD_SHELL_ENV=1` enables startup shell environment hydration.
- `AGENTUI_DEBUG=1` keeps verbose startup diagnostics.

Existing AionUi environment variables continue to work where practical.

## Risks

Some UI panels may need to initialize agents, extensions, channels, or shell environment lazily if they assume startup initialization. The first patch should preserve existing APIs and skip only nonessential startup work.

## Validation

- Type-check the edited files.
- Start the app in dev mode and verify the main window opens.
- Verify disabled startup tasks can still be enabled with environment variables.
