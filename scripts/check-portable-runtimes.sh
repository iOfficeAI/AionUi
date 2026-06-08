#!/usr/bin/env bash
# scripts/check-portable-runtimes.sh
#
# Check whether bundled runtimes can be found WITHOUT relying on system PATH.
# This helps diagnose the gap between what is bundled in managed-resources and
# what the application actually resolves at runtime.
#
# Usage:
#   ./scripts/check-portable-runtimes.sh [MANAGED_RESOURCES_DIR]
#
# Arguments:
#   MANAGED_RESOURCES_DIR   Path to managed-resources directory (default: /tmp/macos-managed)
#
# Exit 0 = all runtimes found, Exit 1 = one or more runtimes missing.

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' NC=''
fi

MANAGED_RESOURCES="${1:-/tmp/macos-managed}"

echo ""
echo "Portable runtime check"
echo "======================"
echo "Managed resources directory: ${MANAGED_RESOURCES}"
echo ""

# Pre-flight
if [[ ! -d "${MANAGED_RESOURCES}" ]]; then
  echo -e "${RED}ERROR:${NC} Directory does not exist: ${MANAGED_RESOURCES}"
  echo "       Provide the path to a prepared managed-resources directory as the first argument."
  exit 1
fi

FOUND=0
MISSING=0
REPORT=()

report_status() {
  local name="$1"
  local status="$2"
  local detail="$3"

  if [[ "${status}" == "found" ]]; then
    echo -e "  ${GREEN}[FOUND]${NC}    ${name}: ${detail}"
    FOUND=$((FOUND + 1))
  else
    echo -e "  ${RED}[MISSING]${NC}  ${name}: ${detail}"
    MISSING=$((MISSING + 1))
  fi
  REPORT+=("${name}: ${status} — ${detail}")
}

# ---------------------------------------------------------------------------
# 1. Node runtime
# ---------------------------------------------------------------------------
echo -e "${CYAN}Node runtime${NC}"

node_dir="${MANAGED_RESOURCES}/node"
node_path=""

if [[ -d "${node_dir}" ]]; then
  for versioned_dir in "${node_dir}"/node-v* "${node_dir}"/v*; do
    [[ ! -d "${versioned_dir}" ]] && continue
    for candidate in "${versioned_dir}/bin/node" "${versioned_dir}/node"; do
      if [[ -f "${candidate}" ]]; then
        node_path="${candidate}"
        break 2
      fi
    done
  done

  # Fallback: broad search for any node binary up to 3 levels deep
  if [[ -z "${node_path}" ]]; then
    node_path="$(find "${node_dir}" -maxdepth 3 -name 'node' -type f 2>/dev/null | head -1)"
  fi

  if [[ -n "${node_path}" ]]; then
    version_output=""
    if [[ -x "${node_path}" ]]; then
      version_output="$("${node_path}" --version 2>/dev/null || true)"
    fi
    if [[ -n "${version_output}" ]]; then
      report_status "node" "found" "${node_path#${MANAGED_RESOURCES}/} (${version_output})"
    else
      report_status "node" "found" "${node_path#${MANAGED_RESOURCES}/} (not executable or failed --version)"
    fi
  else
    report_status "node" "missing" "no node binary found in ${node_dir}"
  fi
else
  report_status "node" "missing" "directory ${node_dir} does not exist"
fi

echo ""

# ---------------------------------------------------------------------------
# 2. Python runtime
# ---------------------------------------------------------------------------
echo -e "${CYAN}Python runtime${NC}"

python_dir="${MANAGED_RESOURCES}/runtimes/python"
python_path=""

if [[ -d "${python_dir}" ]]; then
  for candidate in "${python_dir}/python3" "${python_dir}/python" \
                   "${python_dir}/bin/python3" "${python_dir}/bin/python" \
                   "${python_dir}/install/bin/python3" "${python_dir}/install/bin/python"; do
    if [[ -f "${candidate}" ]]; then
      python_path="${candidate}"
      break
    fi
  done

  # Fallback: broad search
  if [[ -z "${python_path}" ]]; then
    python_path="$(find "${python_dir}" -maxdepth 4 \( -name 'python3' -o -name 'python' \) -type f 2>/dev/null | head -1)"
  fi

  if [[ -n "${python_path}" ]]; then
    version_output=""
    if [[ -x "${python_path}" ]]; then
      version_output="$("${python_path}" --version 2>/dev/null || true)"
    fi
    if [[ -n "${version_output}" ]]; then
      report_status "python" "found" "${python_path#${MANAGED_RESOURCES}/} (${version_output})"
    else
      report_status "python" "found" "${python_path#${MANAGED_RESOURCES}/} (not executable or failed --version)"
    fi
  else
    report_status "python" "missing" "no python binary found in ${python_dir}"
  fi
else
  report_status "python" "missing" "directory ${python_dir} does not exist"
fi

echo ""

# ---------------------------------------------------------------------------
# 3. UV runtime
# ---------------------------------------------------------------------------
echo -e "${CYAN}UV runtime${NC}"

uv_dir="${MANAGED_RESOURCES}/runtimes/uv"
uv_path=""

if [[ -d "${uv_dir}" ]]; then
  for candidate in "${uv_dir}/uv" "${uv_dir}/uv.exe" \
                   "${uv_dir}/bin/uv" "${uv_dir}/bin/uv.exe"; do
    if [[ -f "${candidate}" ]]; then
      uv_path="${candidate}"
      break
    fi
  done

  # Fallback: broad search
  if [[ -z "${uv_path}" ]]; then
    uv_path="$(find "${uv_dir}" -maxdepth 3 -name 'uv' -type f 2>/dev/null | head -1)"
  fi

  if [[ -n "${uv_path}" ]]; then
    version_output=""
    if [[ -x "${uv_path}" ]]; then
      version_output="$("${uv_path}" --version 2>/dev/null || true)"
    fi
    if [[ -n "${version_output}" ]]; then
      report_status "uv" "found" "${uv_path#${MANAGED_RESOURCES}/} (${version_output})"
    else
      report_status "uv" "found" "${uv_path#${MANAGED_RESOURCES}/} (not executable or failed --version)"
    fi
  else
    report_status "uv" "missing" "no uv binary found in ${uv_dir}"
  fi
else
  report_status "uv" "missing" "directory ${uv_dir} does not exist"
fi

echo ""

# ---------------------------------------------------------------------------
# 4. CLI entrypoints (bonus: verify each CLI bundle's entrypoint is reachable)
# ---------------------------------------------------------------------------
echo -e "${CYAN}CLI entrypoints${NC}"

cli_base="${MANAGED_RESOURCES}/cli"
cli_found=0
cli_missing=0

if [[ -d "${cli_base}" ]]; then
  for cli_name in claude codex opencode openclaw; do
    cli_dir="${cli_base}/${cli_name}"
    if [[ ! -d "${cli_dir}" ]]; then
      echo -e "  ${RED}[MISSING]${NC}  ${cli_name}: directory does not exist"
      cli_missing=$((cli_missing + 1))
      continue
    fi

    # Find first manifest.json to check entrypoint
    manifest="$(find "${cli_dir}" -name 'manifest.json' -type f 2>/dev/null | head -1)"
    if [[ -z "${manifest}" ]]; then
      echo -e "  ${RED}[MISSING]${NC}  ${cli_name}: no manifest.json found"
      cli_missing=$((cli_missing + 1))
      continue
    fi

    manifest_dir="$(dirname "${manifest}")"

    # Extract entrypoint using available JSON parser
    entrypoint=""
    if command -v jq >/dev/null 2>&1; then
      entrypoint="$(jq -r '.entrypoint // empty' "${manifest}" 2>/dev/null)"
    elif command -v python3 >/dev/null 2>&1; then
      entrypoint="$(python3 -c "
import json
with open('${manifest}') as f: print(json.load(f).get('entrypoint',''))
" 2>/dev/null | tr -d '[:space:]')"
    elif command -v node >/dev/null 2>&1; then
      entrypoint="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${manifest}','utf8')).entrypoint||'')" 2>/dev/null)"
    fi

    if [[ -n "${entrypoint}" && -f "${manifest_dir}/${entrypoint}" ]]; then
      echo -e "  ${GREEN}[FOUND]${NC}    ${cli_name}: entrypoint ${entrypoint}"
      cli_found=$((cli_found + 1))
    elif [[ -n "${entrypoint}" ]]; then
      echo -e "  ${RED}[MISSING]${NC}  ${cli_name}: entrypoint '${entrypoint}' file not found"
      cli_missing=$((cli_missing + 1))
    else
      echo -e "  ${RED}[MISSING]${NC}  ${cli_name}: entrypoint not specified in manifest"
      cli_missing=$((cli_missing + 1))
    fi
  done
else
  echo -e "  ${YELLOW}[SKIP]${NC}     cli/ directory does not exist"
fi

echo ""

# ---------------------------------------------------------------------------
# 5. System PATH comparison
# ---------------------------------------------------------------------------
echo -e "${CYAN}System PATH comparison${NC}"

for tool_name in node python3 uv; do
  sys_path="$(command -v "${tool_name}" 2>/dev/null || true)"
  if [[ -n "${sys_path}" ]]; then
    echo -e "  ${tool_name}: system PATH resolves to ${sys_path}"
  else
    echo -e "  ${tool_name}: not found in system PATH"
  fi
done

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$((FOUND + MISSING))
echo "======================"
echo "Portable runtimes: ${FOUND}/${TOTAL} found, ${MISSING} missing"
if [[ ${cli_found} -gt 0 || ${cli_missing} -gt 0 ]]; then
  CLI_TOTAL=$((cli_found + cli_missing))
  echo "CLI entrypoints:   ${cli_found}/${CLI_TOTAL} verified"
fi

if [[ ${MISSING} -gt 0 ]]; then
  echo ""
  echo -e "${YELLOW}Diagnosis:${NC} Missing bundled runtimes may cause the application to"
  echo "fall back to system PATH, which can result in version mismatches or"
  echo "'command not found' errors when the system tooling is absent."
  exit 1
fi

echo ""
echo -e "${GREEN}All portable runtimes present.${NC}"
exit 0
