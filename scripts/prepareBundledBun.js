// CLI wrapper for packages/shared-scripts/src/prepare-bundled-bun.js
const path = require('path');
const { prepareBundledBun } = require('../packages/shared-scripts/src/prepare-bundled-bun.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
const arch = process.env.npm_config_target_arch || process.arch;
const version = process.env.AIONUI_BUN_VERSION || 'latest';

try {
  const result = prepareBundledBun({ projectRoot, platform, arch, version });
  if (result.prepared) {
    console.log(`✅ bundled-bun prepared: ${result.dir} [source=${result.sourceType}]`);
  } else {
    console.warn(`⚠️ bundled-bun skipped: ${result.reason}`);
  }
} catch (error) {
  console.error('❌ prepareBundledBun failed:', error.message);
  process.exit(1);
}
