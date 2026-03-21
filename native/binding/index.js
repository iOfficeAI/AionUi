/* Auto-generated napi loader - picks the platform-specific .node binary */
/* eslint-disable */

const { existsSync } = require('fs');
const { join } = require('path');

const { platform, arch } = process;

let nativeBinding = null;

const platformTriple = (() => {
  switch (platform) {
    case 'win32':
      return arch === 'x64' ? 'win32-x64-msvc' : `win32-${arch}-msvc`;
    case 'darwin':
      return `darwin-${arch}`;
    case 'linux':
      return `linux-${arch}-gnu`;
    default:
      throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
})();

const bindingPath = join(__dirname, `aionui-native.${platformTriple}.node`);
if (existsSync(bindingPath)) {
  nativeBinding = require(bindingPath);
} else {
  throw new Error(`Native binding not found at ${bindingPath}. Run "bun run build:native" first.`);
}

module.exports = nativeBinding;
