/**
 * CLI wrapper for prepare-aioncore.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Version resolution order:
 *  1. AIONUI_BACKEND_RUN_ID env (download from AionCore Manual Build artifact)
 *  2. AIONUI_BACKEND_VERSION env (for ad-hoc release overrides)
 *  3. "aioncoreVersion" field in repo-root package.json (the pin)
 *  4. 'latest' (fallback; not recommended for reproducible builds)
 *
 * Environment variables:
 *  - AIONUI_BACKEND_RUN_ID: AionCore Manual Build workflow run id
 *  - AIONUI_BACKEND_VERSION: override the pinned version
 *  - AIONUI_BACKEND_ARCH: target architecture (default: process.arch)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareAioncore } = require('../packages/shared-scripts/src/prepare-aioncore.js');
const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
// Support cross-compilation: AIONUI_BACKEND_ARCH > npm_config_target_arch > process.arch
const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
const version = resolveAioncoreVersion(projectRoot);

try {
  prepareAioncore({ projectRoot, platform, arch, version });
} catch (error) {
  console.error('❌ prepareAioncore failed:', error.message);
  process.exit(1);
}

module.exports = function () {
  try {
    return prepareAioncore({ projectRoot, platform, arch, version });
  } catch (error) {
    console.error('❌ prepareAioncore failed:', error.message);
    throw error;
  }
};
