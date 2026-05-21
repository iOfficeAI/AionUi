/**
 * CLI wrapper for prepare-aionui-backend.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Version resolution order:
 *  1. AIONUI_BACKEND_VERSION env (for ad-hoc overrides)
 *  2. "aionuiBackendVersion" field in repo-root package.json (the pin)
 *  3. 'latest' (fallback; not recommended for reproducible builds)
 *
 * Environment variables:
 *  - AIONUI_BACKEND_VERSION: override the pinned version
 *  - AIONUI_BACKEND_GITHUB_OWNER / AIONUI_BACKEND_GITHUB_REPO: override backend release source
 *    (defaults to halojerry/AionCore)
 *  - AIONUI_BACKEND_SOURCE_BINARY_NAME: source binary name inside the release asset
 *  - AIONUI_BACKEND_TARGET_BINARY_NAME: local packaged binary name (defaults to aionui-backend for runtime compatibility)
 *  - AIONUI_BACKEND_ARCH: target architecture (default: process.arch)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareAionuiBackend } = require('../packages/shared-scripts/src/prepare-aionui-backend.js');
const { resolveBackendVersion } = require('./resolveBackendVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
// Support cross-compilation: AIONUI_BACKEND_ARCH > npm_config_target_arch > process.arch
const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
const version = resolveBackendVersion(projectRoot);

try {
  prepareAionuiBackend({ projectRoot, platform, arch, version });
} catch (error) {
  console.error('❌ prepareAionuiBackend failed:', error.message);
  process.exit(1);
}

module.exports = function () {
  try {
    return prepareAionuiBackend({ projectRoot, platform, arch, version });
  } catch (error) {
    console.error('❌ prepareAionuiBackend failed:', error.message);
    throw error;
  }
};
