# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.23.2-bookworm-slim

FROM node:${NODE_VERSION} AS builder

ARG BUN_VERSION=1.3.14

WORKDIR /app

# AionCore is downloaded while packaging. ICU is also needed when it prepares
# the managed Office tooling bundled into the final Web CLI artifact.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gzip libicu-dev tar \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global --no-audit --no-fund "bun@${BUN_VERSION}"

# Install against the complete workspace manifest set before copying source so
# dependency installation remains cached when only application code changes.
COPY package.json bun.lock ./
COPY patches ./patches
COPY packages/desktop/package.json ./packages/desktop/package.json
COPY packages/shared-scripts/package.json ./packages/shared-scripts/package.json
COPY packages/web-cli/package.json ./packages/web-cli/package.json
COPY packages/web-host/package.json ./packages/web-host/package.json
RUN bun install --frozen-lockfile --ignore-scripts

COPY packages ./packages
COPY public ./public
COPY scripts ./scripts
COPY tsconfig.json uno.config.ts ./
# Optional Linux aioncore for local/dev builds when the pinned release is not
# published yet. Place the binary at docker/prebuilt/aioncore before building.
COPY docker/prebuilt ./docker/prebuilt

ENV NODE_OPTIONS=--max-old-space-size=8192

# Build the browser assets, then create the same standalone Web CLI artifact
# that the release workflow smoke-tests on Debian. The artifact includes the
# compiled launcher, the SPA, and the architecture-matched AionCore backend.
# Prefer a prebuilt multi-user aioncore when present; otherwise download the pin.
RUN bun run package
RUN if [ -x /app/docker/prebuilt/aioncore ]; then \
      export AIONUI_BACKEND_LOCAL_BINARY=/app/docker/prebuilt/aioncore; \
      echo "Using prebuilt aioncore from docker/prebuilt/aioncore"; \
    fi \
    && node scripts/pack-web-cli.js
RUN WEB_CLI_TARBALL="$(find dist-web-cli -maxdepth 1 -name '*.tar.gz' -print -quit)" \
    && test -n "${WEB_CLI_TARBALL}" \
    && bash scripts/smoke-test-web-cli.sh "${WEB_CLI_TARBALL}"

FROM debian:bookworm-slim AS runtime

ARG AIONUI_UID=10001
ARG AIONUI_GID=10001

LABEL org.opencontainers.image.title="AionUi WebUI" \
    org.opencontainers.image.description="Headless AionUi WebUI with bundled AionCore" \
    org.opencontainers.image.source="https://github.com/iOfficeAI/AionUi" \
    org.opencontainers.image.licenses="Apache-2.0"

# curl powers the health check; ICU is required by OfficeCLI previews. Git and
# OpenSSH keep source-control workspaces usable from the containerized agent.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git libicu-dev openssh-client tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && (getent group "${AIONUI_GID}" > /dev/null || groupadd --gid "${AIONUI_GID}" aionui) \
    && useradd --uid "${AIONUI_UID}" --gid "${AIONUI_GID}" --create-home --shell /bin/bash aionui \
    && mkdir -p /data/home /workspace \
    && chown -R "${AIONUI_UID}:${AIONUI_GID}" /data /workspace

COPY --from=builder /app/dist-web-cli/staging/aionui-web /opt/aionui
RUN chmod -R go-w /opt/aionui

ENV NODE_ENV=production \
    PORT=25808 \
    AIONUI_ALLOW_REMOTE=true \
    AIONUI_DATA_DIR=/data \
    AIONUI_LOG_DIR=/data/logs \
    AIONUI_WORK_DIR=/workspace \
    AIONUI_BOOTSTRAP_WORKSPACE=/workspace \
    AIONUI_LOG_LEVEL=info \
    AIONUI_OPEN_BROWSER=false \
    HOME=/data/home \
    PATH="/opt/aionui:${PATH}"

WORKDIR /workspace
USER aionui

VOLUME ["/data", "/workspace"]
EXPOSE 25808

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
    CMD curl --fail --silent --show-error "http://127.0.0.1:${AIONUI_PORT:-${PORT:-25808}}/api/auth/status" > /dev/null || exit 1

STOPSIGNAL SIGTERM
ENTRYPOINT ["aionui-web"]
CMD ["start", "--no-open"]
