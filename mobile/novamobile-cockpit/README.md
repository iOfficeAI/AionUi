# NovaMobile Cockpit

A lightweight AionUi mobile cockpit for the NovaMaster VPS.

The service is intentionally small:

- Basic-auth protected mobile UI
- `/api/status` from `/run/novamaster/health.json`
- systemd allowlist status, logs, and restart
- Noiz TTS smoke action
- Discord Secretary one-shot call action

It is meant to be the phone-first control plane when the desktop PC is off.
Discord stays as the alert and quick-command sidecar.

## Runtime

Expected VPS path:

```text
/root/novamaster/aionui-mobile-cockpit
```

Expected systemd service:

```text
aionui-mobile-cockpit.service
```

Expected local bind:

```text
127.0.0.1:25809
```

Expected public Cloudflare route:

```text
https://aion.novacore.lol/mobile
```

`mobile.novacore.lol` requires Cloudflare DNS write access. The VPS tunnel can
serve the route, but DNS provisioning is not assumed for this runtime package.

## Required environment

Do not commit runtime credentials.

```text
NOVAMOBILE_EMAIL=
NOVAMOBILE_PASSWORD=
NOVAMOBILE_HEALTH_JSON=/run/novamaster/health.json
NOVAMOBILE_DISCORD_DIR=/root/novamaster/services/discord-secretary
NOVAMOBILE_NOIZ_HEALTH_URL=http://127.0.0.1:8118/health
```
