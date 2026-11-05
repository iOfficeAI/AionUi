FROM node:22-slim AS builder
WORKDIR /app

# Install bun
RUN npm install -g bun

# Copy source and install all dependencies (including devDeps for build)
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts

# Build the renderer assets used by the standalone WebUI.
RUN bun run package

# Prepare the backend binary bundle expected by scripts/webui.ts.
ARG TARGETARCH
RUN AIONUI_BACKEND_ARCH="$(case "$TARGETARCH" in amd64) echo x64 ;; arm64) echo arm64 ;; *) node -p 'process.arch' ;; esac)" \
    node scripts/prepareAioncore.js

# ---- Runtime image ----
FROM oven/bun:latest AS runtime
WORKDIR /app

# officecli (the Office preview component, auto-installed at runtime by the
# backend) is a .NET binary that aborts on startup without ICU, and Debian
# base images don't ship it. libicu-dev is version-agnostic so it keeps
# resolving the right libicuNN when the base image bumps Debian releases.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only runtime source, build artifacts, backend bundle, and production deps
COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/out/renderer ./out/renderer
COPY --from=builder /app/resources/bundled-aioncore ./resources/bundled-aioncore
RUN bun install --production --ignore-scripts

ENV AIONUI_PORT=3000
ENV AIONUI_ALLOW_REMOTE=true
ENV AIONUI_DATA_DIR=/data
ENV AIONUI_NO_BUILD=1
ENV AIONUI_OPEN_BROWSER=0
ENV NODE_ENV=production

# SQLite data volume — mount with: -v $(pwd)/data:/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "scripts/webui.ts", "--no-build", "--remote"]
