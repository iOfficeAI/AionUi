#!/usr/bin/env bash
# Download all managed resources for offline bundling.
#
# Run ONCE per version bump on a machine with good network access.
# Output goes to vendor/managed-resources/. Commit the result.
#
# Usage: bash scripts/vendor-managed-resources.sh [--target darwin-arm64]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="${PROJECT_DIR}/vendor/managed-resources"

NODE_VERSION="${NODE_VERSION:-24.11.0}"
CLAUDE_ACP_VERSION="${CLAUDE_ACP_VERSION:-0.39.0}"
CODEX_ACP_VERSION="${CODEX_ACP_VERSION:-0.14.0}"

# Default: all targets. Use --target to limit to one.
DEFAULT_TARGETS="darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64,win32-arm64"
TARGETS="${DEFAULT_TARGETS}"

for arg in "$@"; do
  case "$arg" in
    --target=*) TARGETS="${arg#*=}" ;;
    --target) shift; TARGETS="${1:-${DEFAULT_TARGETS}}" ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
download() {
  local url="$1" output="$2"
  echo "    curl ${url}"
  mkdir -p "$(dirname "${output}")"
  curl -fsSL --retry 3 --retry-delay 5 --connect-timeout 30 -o "${output}" "${url}" || {
    echo "    ERROR: failed to download ${url}" >&2
    return 1
  }
}

target_meta() {
  case "$1" in
    darwin-arm64)  echo 'darwin|arm64|darwin-arm64' ;;
    darwin-x64)    echo 'darwin|x64|darwin-x64' ;;
    linux-x64)     echo 'linux|x64|linux-x64' ;;
    linux-arm64)   echo 'linux|arm64|linux-arm64' ;;
    win32-x64)     echo 'win32|x64|win32-x64' ;;
    win32-arm64)   echo 'win32|arm64|win32-arm64' ;;
    *) echo "ERROR: unsupported target $1" >&2; exit 1 ;;
  esac
}

node_platform_key() {
  case "$1" in
    darwin-arm64)  echo 'darwin-arm64' ;;
    darwin-x64)    echo 'darwin-x64' ;;
    linux-x64)     echo 'linux-x64' ;;
    linux-arm64)   echo 'linux-arm64' ;;
    win32-x64)     echo 'win32-x64' ;;
    win32-arm64)   echo 'win32-arm64' ;;
    *) echo "ERROR: unsupported node platform $1" >&2; exit 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# 1. Node.js runtime
# ---------------------------------------------------------------------------
vendor_node() {
  echo "==> Node.js v${NODE_VERSION}"
  IFS=',' read -r -a targets <<<"${TARGETS}"
  local seen=()
  for target in "${targets[@]}"; do
    local node_plat
    node_plat="$(node_platform_key "${target}")"
    # dedup: darwin-arm64 and darwin-x64 both use darwin-* style but different archives
    local dir_name="node-v${NODE_VERSION}-${node_plat}"
    local dest="${VENDOR_DIR}/node/${dir_name}"
    if [[ -d "${dest}" ]] && [[ -n "$(ls -A "${dest}" 2>/dev/null)" ]]; then
      echo "  ${node_plat}: already vendored"
      continue
    fi
    local ext="tar.gz"
    [[ "${target}" == win32-* ]] && ext="zip"
    local filename="${dir_name}.${ext}"
    local url="https://nodejs.org/dist/v${NODE_VERSION}/${filename}"
    local tmp="/tmp/${filename}"

    echo "  ${node_plat}: downloading"
    download "${url}" "${tmp}" || continue

    echo "  ${node_plat}: extracting"
    rm -rf "${dest}"
    mkdir -p "${dest}"
    if [[ "${ext}" == "zip" ]]; then
      unzip -qo "${tmp}" -d "${VENDOR_DIR}/node/"
      # Node zip extracts to ${dir_name}/...
    else
      tar -xzf "${tmp}" -C "${VENDOR_DIR}/node/"
    fi
    rm -f "${tmp}"
    echo "  ${node_plat}: done (${dest})"
  done
}

# ---------------------------------------------------------------------------
# 2. ACP tools (Claude, Codex) — same install logic as prepare-managed-acp-tools.sh
# ---------------------------------------------------------------------------
vendor_acp_one() {
  local tool_slug="$1" package_name="$2" version="$3"
  echo "==> ${tool_slug} v${version}"
  IFS=',' read -r -a targets <<<"${TARGETS}"

  for target in "${targets[@]}"; do
    local meta plat arch platdir
    meta="$(target_meta "${target}")"
    IFS='|' read -r plat arch platdir <<<"${meta}"

    local dest="${VENDOR_DIR}/acp/${tool_slug}/${version}/${platdir}"
    if [[ -d "${dest}" ]] && [[ -f "${dest}/manifest.json" ]]; then
      echo "  ${target}: already vendored"
      continue
    fi

    local work="/tmp/vendor-acp-${tool_slug}-${target}"
    rm -rf "${work}"
    mkdir -p "${work}/project" "${work}/npm-cache"

    # package.json with platform forcing
    cat > "${work}/project/package.json" <<PKGJSON
{
  "name": "vendor-${tool_slug}",
  "private": true,
  "dependencies": {
    "${package_name}": "${version}"
  }
}
PKGJSON

    echo "  ${target}: npm install"
    cd "${work}/project"
    npm install \
      --cpu "${arch}" \
      --os "${plat}" \
      --cache "${work}/npm-cache" \
      --no-audit --no-fund --silent \
      2>&1 | tail -3 || {
        echo "  ${target}: npm install FAILED, skipping"
        continue
      }

    # Resolve entrypoint (same logic as prepare-managed-acp-tools.sh)
    local entrypoint
    entrypoint="$(node - "${package_name}" "${work}/project" <<'NODESCRIPT'
const fs = require('node:fs');
const path = require('node:path');
const [, , pkgName, projectDir] = process.argv;
const segs = pkgName.split('/');
const pkgDir = path.join(projectDir, 'node_modules', ...segs);
const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
function resolveBin(bin, name) {
  if (typeof bin === 'string' && bin.length > 0) return bin;
  if (!bin || typeof bin !== 'object') throw new Error('no bin');
  const short = name.startsWith('@') ? name.split('/')[1] : name;
  for (const k of [name, short]) if (typeof bin[k] === 'string' && bin[k].length > 0) return bin[k];
  const first = Object.values(bin).find(v => typeof v === 'string' && v.length > 0);
  if (!first) throw new Error('empty bin');
  return first;
}
const ep = resolveBin(pj.bin, pj.name).replace(/\\/g, '/');
const epAbs = path.join(projectDir, 'node_modules', ...segs, ep);
if (!fs.existsSync(epAbs)) throw new Error('entrypoint not found: ' + epAbs);
// Output: just the entrypoint relative path inside node_modules/<pkg>
console.log(path.posix.join('node_modules', ...segs, ep));
NODESCRIPT
)"

    rm -rf "${dest}"
    mkdir -p "${dest}"

    # Copy the installed package into vendor
    local pkg_dir="${work}/project/node_modules"
    cp -R "${pkg_dir}/." "${dest}/"

    # Write local manifest (same format as CDN manifest)
    cat > "${dest}/manifest.json" <<MANIFEST
{
  "entrypoint": "${entrypoint}",
  "path_entries": ["node_modules/.bin"]
}
MANIFEST

    rm -rf "${work}"
    echo "  ${target}: done (${dest})"
  done
}

vendor_acp() {
  vendor_acp_one "claude-agent-acp" "@agentclientprotocol/claude-agent-acp" "${CLAUDE_ACP_VERSION}"
  vendor_acp_one "codex-acp" "@zed-industries/codex-acp" "${CODEX_ACP_VERSION}"
}

# ---------------------------------------------------------------------------
# 3. CLI binaries (OpenCode, OpenClaw) — structure: cli/<name>/<platform>/
# ---------------------------------------------------------------------------
vendor_cli_one() {
  local cli_name="$1" package_name="$2"
  echo "==> CLI: ${cli_name} (${package_name})"
  IFS=',' read -r -a targets <<<"${TARGETS}"

  for target in "${targets[@]}"; do
    local meta plat arch platdir
    meta="$(target_meta "${target}")"
    IFS='|' read -r plat arch platdir <<<"${meta}"

    local dest="${VENDOR_DIR}/cli/${cli_name}/${platdir}"
    if [[ -d "${dest}" ]] && [[ -f "${dest}/manifest.json" ]]; then
      echo "  ${target}: already vendored"
      continue
    fi

    local work="/tmp/vendor-cli-${cli_name}-${target}"
    rm -rf "${work}"
    mkdir -p "${work}/project" "${work}/npm-cache"

    cat > "${work}/project/package.json" <<PKGJSON
{
  "name": "vendor-${cli_name}",
  "private": true,
  "dependencies": {
    "${package_name}": "*"
  }
}
PKGJSON

    echo "  ${target}: npm install"
    cd "${work}/project"
    npm install \
      --cpu "${arch}" \
      --os "${plat}" \
      --cache "${work}/npm-cache" \
      --no-audit --no-fund --silent \
      2>&1 | tail -3 || {
        echo "  ${target}: npm install FAILED, skipping"
        continue
      }

    rm -rf "${dest}"
    mkdir -p "${dest}"

    # Copy everything (binary + deps)
    cp -R "${work}/project/node_modules/." "${dest}/"

    # Resolve bin entry
    local bin_rel
    bin_rel="$(node - "${package_name}" "${work}/project" <<'NODESCRIPT'
const fs = require('node:fs');
const path = require('node:path');
const [, , pkgName, projectDir] = process.argv;
const segs = pkgName.split('/');
const pkgDir = path.join(projectDir, 'node_modules', ...segs);
const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
function resolveBin(bin, name) {
  if (typeof bin === 'string' && bin.length > 0) return bin;
  if (!bin || typeof bin !== 'object') return [name.startsWith('@') ? name.split('/')[1] : name, Object.values(bin)[0]];
  const short = name.startsWith('@') ? name.split('/')[1] : name;
  for (const k of [name, short]) if (typeof bin[k] === 'string' && bin[k].length > 0) return bin[k];
  return Object.values(bin)[0];
}
const ep = resolveBin(pj.bin, pj.name);
console.log(typeof ep === 'string' ? ep.replace(/\\/g, '/') : ep.replace(/\\/g, '/'));
NODESCRIPT
)"

    cat > "${dest}/manifest.json" <<MANIFEST
{
  "entrypoint": "${bin_rel}",
  "path_entries": [".bin"]
}
MANIFEST

    rm -rf "${work}"
    echo "  ${target}: done (${dest})"
  done
}

vendor_clis() {
  vendor_cli_one "opencode" "opencode-ai"
  vendor_cli_one "openclaw" "openclaw"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo "==> Vendoring managed resources to ${VENDOR_DIR}"
  echo "    Targets:   ${TARGETS}"
  echo "    Node.js:   v${NODE_VERSION}"
  echo "    Claude ACP: v${CLAUDE_ACP_VERSION}"
  echo "    Codex ACP:  v${CODEX_ACP_VERSION}"
  echo ""

  mkdir -p "${VENDOR_DIR}"

  vendor_node
  echo ""
  vendor_acp
  echo ""
  vendor_clis
  echo ""

  echo "==> Done: ${VENDOR_DIR}"
  du -sh "${VENDOR_DIR}" 2>/dev/null || true
  echo ""
  find "${VENDOR_DIR}" -maxdepth 4 -type d | sort | sed "s|${VENDOR_DIR}/|    |"
}

main "$@"
