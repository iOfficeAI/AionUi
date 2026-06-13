# Headless WebUI image — mirrors the pack-web-cli release flow:
# SPA static assets + bun-compiled web-cli + bundled aioncore backend.
FROM node:20-slim AS builder
WORKDIR /app

# Install bun
RUN npm install -g bun

# Workspace manifests first so the install layer stays cached
COPY package.json bun.lock ./
COPY patches/ ./patches/
COPY packages/desktop/package.json packages/desktop/
COPY packages/shared-scripts/package.json packages/shared-scripts/
COPY packages/web-cli/package.json packages/web-cli/
COPY packages/web-host/package.json packages/web-host/
RUN bun install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Build the SPA static assets (same command as the pack-web-cli CI workflow)
RUN bunx electron-vite build --config packages/desktop/electron.vite.config.ts

# Download the pinned aioncore backend + managed resources for this platform
RUN node scripts/prepareAioncore.js

# Compile web-cli into a standalone executable (bundles the bun runtime)
RUN bun build --compile --outfile=/app/dist/aionui-web packages/web-cli/src/index.ts

# ---- Runtime image ----
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git curl \
    && rm -rf /var/lib/apt/lists/*

# Assemble the aionui-web tarball layout: binary + package.json (version
# lookup) + static/ (SPA) + bundled-aioncore/<platform-arch>/
COPY --from=builder /app/dist/aionui-web ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/out/renderer ./static
COPY --from=builder /app/resources/bundled-aioncore ./bundled-aioncore

ENV AIONUI_PORT=3000
ENV AIONUI_ALLOW_REMOTE=true
ENV AIONUI_DATA_DIR=/data
ENV AIONUI_OPEN_BROWSER=0

# SQLite data volume — mount with: -v $(pwd)/data:/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["./aionui-web", "start"]
