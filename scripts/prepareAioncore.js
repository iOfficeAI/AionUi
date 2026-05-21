/**
 * Compatibility wrapper aligned with upstream naming.
 *
 * Internally reuses the current transitional prepareAionuiBackend pipeline so
 * fork-specific runtime compatibility stays intact while scripts can begin
 * migrating toward the upstream aioncore naming.
 */

const path = require('path');
const { prepareAioncore: prepareAioncoreBinary } = require('../packages/shared-scripts/src/prepare-aioncore.js');
const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
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
