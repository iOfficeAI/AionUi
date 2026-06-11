#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  AWS_S3_BUCKET=<bucket> ./scripts/prepare-managed-acp-tools.sh

Environment variables:
  AWS_S3_BUCKET                Required. Destination bucket.
  AWS_ENDPOINT_URL             Optional. Alternate S3-compatible endpoint.
  MANAGED_ACP_PREFIX           Optional. S3 key prefix. Default: managed/acp
  MANAGED_ACP_CDN_BASE         Optional. Public CDN base. Default: https://static.aionui.com/managed/acp
  MANAGED_ACP_TARGETS          Optional. Comma-separated targets.
                               Default: darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64,win32-arm64
  MANAGED_ACP_OVERWRITE        Optional. true/false. Default: false
  MANAGED_ACP_WRITE_ROOT_MANIFEST
                               Optional. true/false. Default: false
  MANAGED_ACP_NPM_VERSION      Optional. Exact npm version expected in PATH.
  CODEX_ACP_VERSION            Optional. Default: 0.14.0
  CLAUDE_ACP_VERSION           Optional. Default: 0.39.0
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

trim() {
  printf '%s' "$1" | awk '{$1=$1;print}'
}

require_cmd aws
require_cmd node
require_cmd npm
require_cmd sha256sum
require_cmd tar
require_cmd zip
require_cmd zstd

AWS_S3_BUCKET="${AWS_S3_BUCKET:-}"
if [[ -z "${AWS_S3_BUCKET}" ]]; then
  echo "AWS_S3_BUCKET is required." >&2
  exit 1
fi

MANAGED_ACP_PREFIX="${MANAGED_ACP_PREFIX:-managed/acp}"
MANAGED_ACP_CDN_BASE="${MANAGED_ACP_CDN_BASE:-https://static.aionui.com/managed/acp}"
MANAGED_ACP_TARGETS="${MANAGED_ACP_TARGETS:-darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64,win32-arm64}"
MANAGED_ACP_OVERWRITE="${MANAGED_ACP_OVERWRITE:-false}"
MANAGED_ACP_WRITE_ROOT_MANIFEST="${MANAGED_ACP_WRITE_ROOT_MANIFEST:-false}"
MANAGED_ACP_NPM_VERSION="${MANAGED_ACP_NPM_VERSION:-}"
CODEX_ACP_VERSION="${CODEX_ACP_VERSION:-0.14.0}"
CLAUDE_ACP_VERSION="${CLAUDE_ACP_VERSION:-0.39.0}"

sanitize_version() {
  local value="$1"
  value="${value#v}"
  case "${value}" in
    ''|*[!0-9.]*)
      echo "Invalid version: ${1}" >&2
      exit 1
      ;;
  esac
  printf '%s' "${value}"
}

CODEX_ACP_VERSION="$(sanitize_version "${CODEX_ACP_VERSION}")"
CLAUDE_ACP_VERSION="$(sanitize_version "${CLAUDE_ACP_VERSION}")"

if [[ -n "${MANAGED_ACP_NPM_VERSION}" ]]; then
  MANAGED_ACP_NPM_VERSION="$(sanitize_version "${MANAGED_ACP_NPM_VERSION}")"
  if [[ "$(npm --version)" != "${MANAGED_ACP_NPM_VERSION}" ]]; then
    echo "npm version mismatch: expected ${MANAGED_ACP_NPM_VERSION}, got $(npm --version)" >&2
    exit 1
  fi
fi

aws_s3_cp() {
  if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
    aws --endpoint-url "${AWS_ENDPOINT_URL}" s3 cp "$@"
  else
    aws s3 cp "$@"
  fi
}

aws_s3_ls() {
  if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
    aws --endpoint-url "${AWS_ENDPOINT_URL}" s3 ls "$@"
  else
    aws s3 ls "$@"
  fi
}

object_exists() {
  local key="$1"
  aws_s3_ls "s3://${AWS_S3_BUCKET}/${key}" >/dev/null 2>&1
}

upload_file() {
  local src="$1"
  local key="$2"
  shift 2

  if [[ "${MANAGED_ACP_OVERWRITE}" != "true" ]] && object_exists "${key}"; then
    echo "Refusing to overwrite existing object: s3://${AWS_S3_BUCKET}/${key}" >&2
    exit 1
  fi

  aws_s3_cp "${src}" "s3://${AWS_S3_BUCKET}/${key}" "$@"
}

target_meta() {
  case "$1" in
    darwin-arm64) printf 'darwin|arm64|tar.zst\n' ;;
    darwin-x64) printf 'darwin|x64|tar.zst\n' ;;
    linux-x64) printf 'linux|x64|tar.zst\n' ;;
    linux-arm64) printf 'linux|arm64|tar.zst\n' ;;
    win32-x64) printf 'win32|x64|zip\n' ;;
    win32-arm64) printf 'win32|arm64|zip\n' ;;
    *)
      echo "Unsupported target: $1" >&2
      exit 1
      ;;
  esac
}

resolve_entrypoint_manifest() {
  local package_name="$1"
  local project_dir="$2"
  local output_path="$3"

  node - "${package_name}" "${project_dir}" "${output_path}" <<'EOF'
const fs = require('node:fs');
const path = require('node:path');

const [, , packageName, projectDir, outputPath] = process.argv;
const packageSegments = packageName.split('/');
const packageDir = path.join(projectDir, 'node_modules', ...packageSegments);
const packageJsonPath = path.join(packageDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

function resolveBinField(binField, pkgName) {
  if (typeof binField === 'string' && binField.length > 0) {
    return binField;
  }
  if (!binField || typeof binField !== 'object') {
    throw new Error(`Package ${pkgName} does not expose a bin entry.`);
  }

  const shortName = pkgName.startsWith('@') ? pkgName.split('/')[1] : pkgName;
  const preferredKeys = [pkgName, shortName];
  for (const key of preferredKeys) {
    if (typeof binField[key] === 'string' && binField[key].length > 0) {
      return binField[key];
    }
  }

  const first = Object.values(binField).find((value) => typeof value === 'string' && value.length > 0);
  if (!first) {
    throw new Error(`Package ${pkgName} has an empty bin map.`);
  }
  return first;
}

const entrypointRelative = resolveBinField(packageJson.bin, packageJson.name).replace(/\\/g, '/');
const entrypoint = path.posix.join('node_modules', ...packageSegments, entrypointRelative);
const entrypointAbsolute = path.join(projectDir, entrypoint);
if (!fs.existsSync(entrypointAbsolute)) {
  throw new Error(`Resolved entrypoint does not exist: ${entrypoint}`);
}

const localManifest = {
  entrypoint,
  path_entries: ['node_modules/.bin'],
};

fs.writeFileSync(outputPath, `${JSON.stringify(localManifest, null, 2)}\n`);
EOF
}

pack_artifact() {
  local source_dir="$1"
  local output_path="$2"
  local ext="$3"

  rm -f "${output_path}"

  case "${ext}" in
    tar.zst)
      tar -C "${source_dir}" -cf - . | zstd -19 -T0 -q -o "${output_path}"
      ;;
    zip)
      (
        cd "${source_dir}"
        zip -qr "${output_path}" .
      )
      ;;
    *)
      echo "Unsupported archive extension: ${ext}" >&2
      exit 1
      ;;
  esac
}

make_project_dir() {
  local project_dir="$1"
  local package_name="$2"
  local version="$3"
  mkdir -p "${project_dir}"
  node - "${project_dir}" "${package_name}" "${version}" <<'EOF'
const fs = require('node:fs');
const path = require('node:path');

const [, , projectDir, packageName, version] = process.argv;
const packageJson = {
  name: 'managed-acp-artifact',
  private: true,
  version: '0.0.0',
  dependencies: {
    [packageName]: version,
  },
};

fs.writeFileSync(path.join(projectDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
EOF
}

generate_lockfile() {
  local project_dir="$1"
  local npm_cache_dir="$2"
  local platform="$3"
  local arch="$4"

  (
    cd "${project_dir}"
    export npm_config_cache="${npm_cache_dir}"
    export npm_config_fund=false
    export npm_config_audit=false
    npm install --package-lock-only --omit=dev --os="${platform}" --cpu="${arch}"
  )
}

install_from_lockfile() {
  local project_dir="$1"
  local npm_cache_dir="$2"
  local platform="$3"
  local arch="$4"

  (
    cd "${project_dir}"
    export npm_config_cache="${npm_cache_dir}"
    export npm_config_fund=false
    export npm_config_audit=false
    npm ci --omit=dev --os="${platform}" --cpu="${arch}"
  )
}

manifest_entrypoint() {
  local manifest_path="$1"

  node - "${manifest_path}" <<'EOF'
const fs = require('node:fs');

const [, , manifestPath] = process.argv;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.entrypoint) {
  throw new Error(`Missing entrypoint in ${manifestPath}`);
}
process.stdout.write(manifest.entrypoint);
EOF
}

validate_bridge_entrypoint() {
  local tool_slug="$1"
  local project_dir="$2"
  local manifest_path="$3"

  local entrypoint_rel
  entrypoint_rel="$(manifest_entrypoint "${manifest_path}")"
  local entrypoint_abs="${project_dir}/${entrypoint_rel}"

  if [[ ! -f "${entrypoint_abs}" ]]; then
    echo "Resolved ${tool_slug} entrypoint missing: ${entrypoint_rel}" >&2
    exit 1
  fi

  node --check "${entrypoint_abs}" >/dev/null
}

validate_platform_binary() {
  local tool_slug="$1"
  local project_dir="$2"
  local target="$3"

  local expected_path=""
  case "${tool_slug}" in
    codex-acp)
      expected_path="${project_dir}/node_modules/@zed-industries/codex-acp-${target}/bin/codex-acp"
      if [[ "${target}" == win32-* ]]; then
        expected_path="${expected_path}.exe"
      fi
      ;;
    claude-agent-acp)
      expected_path="${project_dir}/node_modules/@anthropic-ai/claude-agent-sdk-${target}/claude"
      if [[ "${target}" == win32-* ]]; then
        expected_path="${expected_path}.exe"
      fi
      ;;
    *)
      echo "Unknown ACP tool slug for platform validation: ${tool_slug}" >&2
      exit 1
      ;;
  esac

  if [[ ! -f "${expected_path}" ]]; then
    echo "Expected platform binary missing for ${tool_slug} (${target}): ${expected_path}" >&2
    exit 1
  fi
}

prepare_tool_target() {
  local tool_slug="$1"
  local package_name="$2"
  local version="$3"
  local target="$4"
  local rows_path="$5"
  local work_dir="$6"

  local meta
  meta="$(target_meta "${target}")"
  IFS='|' read -r platform arch archive_ext <<<"${meta}"

  local project_dir="${work_dir}/${tool_slug}/${target}/project"
  local npm_cache_dir="${work_dir}/${tool_slug}/${target}/npm-cache"
  local local_manifest_path="${project_dir}/manifest.json"
  local artifact_filename="${tool_slug}-${version}-${target}.${archive_ext}"
  local artifact_path="${work_dir}/${tool_slug}/${target}/${artifact_filename}"
  local object_key="${MANAGED_ACP_PREFIX}/${tool_slug}/${version}/${artifact_filename}"
  local artifact_url="${MANAGED_ACP_CDN_BASE}/${tool_slug}/${version}/${artifact_filename}"

  mkdir -p "${project_dir}" "${npm_cache_dir}"
  make_project_dir "${project_dir}" "${package_name}" "${version}"

  echo "==> Generating lockfile for ${package_name}@${version} (${target})"
  generate_lockfile "${project_dir}" "${npm_cache_dir}" "${platform}" "${arch}"

  echo "==> Installing ${package_name}@${version} for ${target} from lockfile"
  install_from_lockfile "${project_dir}" "${npm_cache_dir}" "${platform}" "${arch}"

  resolve_entrypoint_manifest "${package_name}" "${project_dir}" "${local_manifest_path}"
  validate_bridge_entrypoint "${tool_slug}" "${project_dir}" "${local_manifest_path}"
  validate_platform_binary "${tool_slug}" "${project_dir}" "${target}"
  pack_artifact "${project_dir}" "${artifact_path}" "${archive_ext}"

  local sha256
  sha256="$(sha256sum "${artifact_path}" | awk '{print $1}')"
  local size_bytes
  size_bytes="$(wc -c <"${artifact_path}" | tr -d ' ')"

  echo "==> Uploading ${artifact_filename}"
  upload_file \
    "${artifact_path}" \
    "${object_key}" \
    --cache-control "public, max-age=31536000, immutable"

  printf '%s|%s|%s|%s|%s|%s\n' \
    "${tool_slug}" "${version}" "${target}" "${artifact_url}" "${sha256}" "${size_bytes}" >>"${rows_path}"
}

write_version_manifest() {
  local tool_slug="$1"
  local version="$2"
  local rows_path="$3"
  local output_path="$4"

  node - "${tool_slug}" "${version}" "${rows_path}" "${output_path}" <<'EOF'
const fs = require('node:fs');

const [, , toolSlug, version, rowsPath, outputPath] = process.argv;
const rows = fs
  .readFileSync(rowsPath, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [slug, rowVersion, target, url, sha256, size] = line.split('|');
    return { slug, rowVersion, target, url, sha256, size: Number(size) };
  })
  .filter((row) => row.slug === toolSlug && row.rowVersion === version);

const manifest = {
  tool: toolSlug,
  version,
  generatedAt: new Date().toISOString(),
  artifacts: Object.fromEntries(
    rows.map((row) => [
      row.target,
      {
        url: row.url,
        sha256: row.sha256,
        size: row.size,
      },
    ])
  ),
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
EOF
}

write_root_manifest() {
  local rows_path="$1"
  local output_path="$2"

  node - "${rows_path}" "${output_path}" "${MANAGED_ACP_CDN_BASE}" <<'EOF'
const fs = require('node:fs');

const [, , rowsPath, outputPath, cdnBase] = process.argv;
const rows = fs
  .readFileSync(rowsPath, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [tool, version] = line.split('|');
    return { tool, version };
  });

const latest = new Map();
for (const row of rows) {
  latest.set(row.tool, row.version);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  tools: Object.fromEntries(
    [...latest.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tool, version]) => [
      tool,
      {
        version,
        manifest_url: `${cdnBase}/${tool}/${version}/manifest.json`,
      },
    ])
  ),
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
EOF
}

declare -a targets=()
IFS=',' read -r -a raw_targets <<<"${MANAGED_ACP_TARGETS}"
for raw_target in "${raw_targets[@]}"; do
  target="$(trim "${raw_target}")"
  if [[ -n "${target}" ]]; then
    targets+=("${target}")
  fi
done

if [[ "${#targets[@]}" -eq 0 ]]; then
  echo "No valid targets resolved from MANAGED_ACP_TARGETS." >&2
  exit 1
fi

declare -a tool_specs=(
  "codex-acp|@zed-industries/codex-acp|${CODEX_ACP_VERSION}"
  "claude-agent-acp|@agentclientprotocol/claude-agent-acp|${CLAUDE_ACP_VERSION}"
)

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

rows_path="${work_dir}/artifact-rows.txt"
: > "${rows_path}"

for tool_spec in "${tool_specs[@]}"; do
  IFS='|' read -r tool_slug package_name version <<<"${tool_spec}"
  for target in "${targets[@]}"; do
    prepare_tool_target "${tool_slug}" "${package_name}" "${version}" "${target}" "${rows_path}" "${work_dir}"
  done

  version_manifest_path="${work_dir}/${tool_slug}-${version}-manifest.json"
  write_version_manifest "${tool_slug}" "${version}" "${rows_path}" "${version_manifest_path}"

  echo "==> Uploading ${tool_slug} ${version} manifest"
  upload_file \
    "${version_manifest_path}" \
    "${MANAGED_ACP_PREFIX}/${tool_slug}/${version}/manifest.json" \
    --content-type "application/json; charset=utf-8" \
    --cache-control "public, max-age=300"
done

if [[ "${MANAGED_ACP_WRITE_ROOT_MANIFEST}" == "true" ]]; then
  root_manifest_path="${work_dir}/managed-acp-root-manifest.json"
  write_root_manifest "${rows_path}" "${root_manifest_path}"
  echo "==> Uploading managed ACP root manifest"
  upload_file \
    "${root_manifest_path}" \
    "${MANAGED_ACP_PREFIX}/manifest.json" \
    --content-type "application/json; charset=utf-8" \
    --cache-control "public, max-age=300"
fi

{
  echo "## Managed ACP artifacts uploaded"
  echo ""
  echo "- Bucket prefix: \`s3://${AWS_S3_BUCKET}/${MANAGED_ACP_PREFIX}/\`"
  echo "- Codex ACP manifest: \`${MANAGED_ACP_CDN_BASE}/codex-acp/${CODEX_ACP_VERSION}/manifest.json\`"
  echo "- Claude ACP manifest: \`${MANAGED_ACP_CDN_BASE}/claude-agent-acp/${CLAUDE_ACP_VERSION}/manifest.json\`"
  echo "- Targets: \`${MANAGED_ACP_TARGETS}\`"
} >&2
