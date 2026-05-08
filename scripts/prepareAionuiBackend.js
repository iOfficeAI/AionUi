/**
 * CLI wrapper for prepare-aionui-backend.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Environment variables:
 *  - AIONUI_BACKEND_VERSION: version tag (default: 'latest')
 *  - AIONUI_BACKEND_ARCH: target architecture (default: process.arch)
 *  - AIONUI_BACKEND_ALLOW_MISSING: allow missing backend ('1' to enable)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareAionuiBackend } = require('../packages/shared-scripts/src/prepare-aionui-backend.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
// Support cross-compilation: AIONUI_BACKEND_ARCH > npm_config_target_arch > process.arch
const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
const version = process.env.AIONUI_BACKEND_VERSION || 'latest';
const allowMissing = process.env.AIONUI_BACKEND_ALLOW_MISSING === '1';

try {
  prepareAionuiBackend({ projectRoot, platform, arch, version, allowMissing });
} catch (error) {
  console.error('❌ prepareAionuiBackend failed:', error.message);
  process.exit(1);
}

module.exports = function () {
  try {
    return prepareAionuiBackend({ projectRoot, platform, arch, version, allowMissing });
  } catch (error) {
    console.error('❌ prepareAionuiBackend failed:', error.message);
    throw error;
  }
};
