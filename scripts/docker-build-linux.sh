#!/usr/bin/env bash
# Build a Linux .deb inside electronuserland/builder.
# Designed to be run *inside* the container; the host invokes it via `docker run`.
set -euo pipefail

echo '==> Installing ruby + fpm + bun'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ruby ruby-dev rubygems build-essential rpm >/dev/null
gem install --no-document fpm >/dev/null

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash >/dev/null
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

cd /project
echo '==> Cleaning Windows-built artifacts'
rm -rf out/main out/preload out/renderer out/linux-unpacked out/win-unpacked resources/bundled-bun resources/bundled-aionrs

echo '==> bun install'
bun install --frozen-lockfile

echo '==> bun run build-deb'
bun run build-deb

echo '==> Done. Output:'
ls -la out/*.deb 2>/dev/null || true
