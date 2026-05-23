/**
 * CLI wrapper for prepare-aioncore.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Version resolution order:
 *  1. AIONCORE_VERSION env (for ad-hoc overrides)
 *  2. "aioncoreVersion" field in repo-root package.json (the pin)
 *  3. 'latest' (fallback; not recommended for reproducible builds)
 *
 * Environment variables:
 *  - AIONCORE_VERSION: override the pinned version
 *  - AIONCORE_GITHUB_OWNER / AIONCORE_GITHUB_REPO: override backend release source
 *    (defaults to halojerry/AionCore)
 *  - AIONCORE_SOURCE_BINARY_NAME: source binary name inside the release asset
 *  - AIONCORE_TARGET_BINARY_NAME: local packaged binary name (defaults to aioncore)
 *  - AIONCORE_ARCH: target architecture (default: process.arch)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareAioncore: prepareAioncoreBinary } = require('../packages/shared-scripts/src/prepare-aioncore.js');
const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
const arch = process.env.AIONCORE_ARCH || process.env.npm_config_target_arch || process.arch;
const version = resolveAioncoreVersion(projectRoot);

function prepareAioncore() {
  return prepareAioncoreBinary({ projectRoot, platform, arch, version });
}

try {
  if (require.main === module) {
    prepareAioncore();
  }
} catch (error) {
  console.error('❌ prepareAioncore failed:', error.message);
  process.exit(1);
}

module.exports = prepareAioncore;
