const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Share pure functions from the main AionUi project
const sharedCommonRoot = path.resolve(workspaceRoot, 'packages/desktop/src/common');
config.watchFolders = [sharedCommonRoot];

// Resolve node_modules from mobile/ only
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Block platform-specific packages that should never resolve in RN
config.resolver.blockList = [
  /src\/common\/storage\.ts$/, // Uses @office-ai/platform storage
  /src\/common\/slash\//, // Slash command internals
  /@office-ai\/platform/,
];

// Map path aliases for shared code
config.resolver.extraNodeModules = {
  '@common': sharedCommonRoot,
};

module.exports = config;
