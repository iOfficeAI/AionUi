/**
 * Resolve the aioncore version tag to download for packaging.
 *
 * Order:
 *   1. AIONUI_BACKEND_VERSION env (ad-hoc override)
 *   2. "aioncoreVersion" in repo-root package.json
 *   3. "aionuiBackendVersion" in repo-root package.json (legacy fallback)
 *   4. 'latest'
 */

const fs = require('fs');
const path = require('path');

function readPkg(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function resolveAioncoreVersion(projectRoot) {
  const envOverride = process.env.AIONUI_BACKEND_VERSION;
  if (envOverride && envOverride.trim()) {
    return envOverride.trim();
  }

  try {
    const pkg = readPkg(projectRoot);
    if (pkg && typeof pkg.aioncoreVersion === 'string' && pkg.aioncoreVersion.trim()) {
      return pkg.aioncoreVersion.trim();
    }
    if (pkg && typeof pkg.aionuiBackendVersion === 'string' && pkg.aionuiBackendVersion.trim()) {
      return pkg.aionuiBackendVersion.trim();
    }
  } catch {
    // fall through
  }

  return 'latest';
}

module.exports = { resolveAioncoreVersion };
