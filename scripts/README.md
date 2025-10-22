# Build Scripts Documentation

This directory contains scripts for building and packaging AionUi across different platforms and architectures.

## Scripts Overview

| Script | Lines | Purpose |
|--------|-------|---------|
| `build-with-builder.js` | 116 | Coordinates Electron Forge and electron-builder |
| `rebuildNativeModules.js` | 219 | **Unified native module rebuild utility** |
| `beforeBuild.js` | 38 | Pre-packaging native module rebuild hook |
| `afterPack.js` | 67 | Post-packaging verification (Linux only) |
| `afterSign.js` | 47 | macOS code signing and notarization |

**Total**: 487 lines (down from 711 lines before optimization)

## Architecture

### Build Flow

```
npm run dist:*
    ↓
build-with-builder.js
    ↓
    ├─→ Electron Forge (webpack compilation)
    ↓
electron-builder
    ↓
    ├─→ beforeBuild.js → rebuildNativeModules.js (all platforms)
    ├─→ Package app
    ├─→ afterPack.js → rebuildNativeModules.js (Linux only)
    └─→ afterSign.js (macOS only)
```

## Native Module Rebuild Strategy

### `rebuildNativeModules.js` - Unified Rebuild Utility

This is the core module that handles all native module rebuilding. It provides:

#### Functions

1. **`rebuildWithElectronRebuild(options)`**
   - Used by: `beforeBuild.js`
   - Rebuilds all native modules in source directory
   - Modules: `better-sqlite3`, `bcrypt`, `node-pty` (macOS/Linux only)

2. **`rebuildSingleModule(options)`**
   - Used by: `afterPack.js`
   - Rebuilds a single module in packaged app
   - Strategy: Try prebuild-install first, fall back to electron-rebuild

3. **`verifyModuleBinary(moduleRoot, moduleName)`**
   - Verifies native binary exists after rebuild

4. **Helper utilities**:
   - `normalizeArch()`: Normalize architecture names
   - `getModulesToRebuild()`: Get platform-specific module list
   - `buildEnvironment()`: Create rebuild environment variables

### Platform-Specific Behavior

#### Windows
- **Modules rebuilt**: `better-sqlite3`, `bcrypt`
- **Skipped**: `node-pty` (uses prebuilt binaries)
- **Environment**: MSVS 2022, Windows SDK 10.0.19041.0

#### macOS
- **Modules rebuilt**: `better-sqlite3`, `bcrypt`, `node-pty`
- **When**: `beforeBuild` hook only
- **Post-build**: Code signing and notarization

#### Linux
- **Modules rebuilt**: `better-sqlite3`, `bcrypt`, `node-pty`
- **When**:
  - `beforeBuild`: Rebuild in source directory
  - `afterPack`: Rebuild `better-sqlite3` in packaged app
- **Strategy**: Download prebuilt binary first, compile if unavailable

## Usage Examples

### Building for specific platform

```bash
# Build for macOS
npm run dist:mac

# Build for Windows
npm run dist:win

# Build for Linux
npm run dist:linux
```

### Manual native module rebuild

```javascript
const { rebuildWithElectronRebuild } = require('./scripts/rebuildNativeModules');

rebuildWithElectronRebuild({
  platform: 'linux',
  arch: 'arm64',
  electronVersion: '37.3.1',
});
```

### Rebuild single module in packaged app

```javascript
const { rebuildSingleModule } = require('./scripts/rebuildNativeModules');

rebuildSingleModule({
  moduleName: 'better-sqlite3',
  moduleRoot: '/path/to/app.asar.unpacked/node_modules/better-sqlite3',
  platform: 'linux',
  arch: 'arm64',
  electronVersion: '37.3.1',
});
```

## Why Two Rebuild Stages?

### beforeBuild (All Platforms)
- Rebuilds modules in **source directory** (`node_modules/`)
- Ensures correct binaries are packaged
- Uses `electron-rebuild` for all modules

### afterPack (Linux Only)
- Rebuilds `better-sqlite3` in **packaged app** (`app.asar.unpacked/`)
- Handles cross-compilation issues
- Uses `prebuild-install` for faster builds (downloads prebuilt binary)

## Troubleshooting

### Module not found after packaging

**Symptom**: `Error: Cannot find module 'better-sqlite3'`

**Solution**: Check that:
1. Module is in `electron-builder.yml` → `files` section
2. Module is in `electron-builder.yml` → `asarUnpack` section
3. `beforeBuild.js` ran successfully during build
4. For Linux: `afterPack.js` ran successfully

### Native module crashes on launch

**Symptom**: App crashes with segfault or binary incompatibility error

**Solution**:
1. Verify target architecture matches build architecture
2. Check that `beforeBuild.js` rebuilt for correct architecture
3. For Linux ARM64: Ensure `afterPack.js` rebuilt the module

### Cross-compilation fails

**Symptom**: Native module rebuild fails during cross-arch build

**Solution**:
- Windows: This is expected for `node-pty` (uses prebuilt binaries)
- macOS/Linux: Ensure build tools for target architecture are installed
- Consider building on native architecture instead

## Optimization History

### Version 1.0 (Before Optimization)
- Total: 711 lines across 5 files
- Duplication: Rebuild logic in both `beforeBuild` and `afterPack`

### Version 2.0 (Current)
- Total: 487 lines across 5 files
- Savings: 224 lines (31% reduction)
- Changes:
  - ✅ Deleted `release.sh` (67 lines) - use `npm version` instead
  - ✅ Created `rebuildNativeModules.js` (219 lines) - unified utility
  - ✅ Simplified `build-with-builder.js`: 321 → 116 lines
  - ✅ Simplified `beforeBuild.js`: 95 → 38 lines
  - ✅ Simplified `afterPack.js`: 181 → 67 lines

## Contributing

When modifying build scripts:

1. **Test on all platforms** before committing
2. **Update this documentation** if behavior changes
3. **Maintain the unified rebuild utility** - avoid duplicating logic
4. **Keep error messages clear** - they help users troubleshoot

## Related Files

- `/electron-builder.yml` - electron-builder configuration
- `/forge.config.ts` - Electron Forge configuration
- `/.github/workflows/build-and-release.yml` - CI/CD pipeline
- `/package.json` - Build scripts and dependencies
