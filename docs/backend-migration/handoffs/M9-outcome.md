# M9 Outcome: Install-Web Script

## Branch & Baseline

- **Branch**: `feat/m9-install-web-script`
- **HEAD**: `4d6cc3197`
- **Base**: `origin/feat/m8-web-cli-tarball` @ `d71697fc5`
- **Baseline sync status**: ✅ Synced with `origin/feat/backend-migration` @ `de0c7b87d` (already up to date)

## Deliverables

### 1. Installation Script

**Core Script** (`scripts/install-web.sh`):
- One-click installation via `curl | bash`
- Supports 5 platforms: darwin-arm64/x86_64, linux-x86_64/aarch64, win-x86_64
- Auto-detects platform and architecture
- Downloads tarball + SHA256 from GitHub releases or file:// mirror
- Verifies checksum integrity
- Extracts to install directory (default: `~/.local/share/aionui-web`)
- Creates symlink (`~/.local/bin/aionui-web`)
- Updates shell profile PATH (bash/zsh/fish)

**Command-Line Options**:
- `--version <version>`: Specify version (default: latest or CI-embedded)
- `--mirror <url>`: Custom mirror URL (default: GitHub releases)
- `--install-dir <path>`: Custom install directory (default: ~/.local/share/aionui-web)
- `--no-symlink`: Skip symlink creation
- `--no-path`: Skip shell profile update
- `--help`: Show help message

**Environment Variables**:
- `VERSION`: Version to install
- `INSTALL_DIR`: Installation directory
- `MIRROR`: Mirror URL
- `BIN_DIR`: Symlink directory (default: ~/.local/bin)
- `CREATE_SYMLINK`: Create symlink (1/0)
- `UPDATE_PATH`: Update shell profile (1/0)

### 2. CI Integration

**Workflow Additions** (`.github/workflows/pack-web-cli.yml`):

**prepare-install-script job**:
- Runs after `pack-web-cli`
- Gets version from package.json
- Replaces `__VERSION__` placeholder with actual version
- Uploads install-web.sh as CI artifact (`install-web-script`)

**smoke-test-install job**:
- Runs in debian:bookworm-slim container
- Downloads linux-x86_64 tarball + install-web.sh
- Tests file:// mirror installation
- Verifies directory structure, symlink, version command

### 3. Smoke Test Script

**Script** (`scripts/smoke-test-install-web.sh`):
- Tests full installation flow
- Accepts mirror URL and version as arguments
- Verifies:
  - Installation directory exists
  - CLI entry point (`bin/aionui-web.js`) exists
  - Symlink created correctly
  - Version command works
- Cleans up after test

**Local Testing**:
```bash
# Prepare mock tarball
mkdir -p /tmp/mock-releases/v1.0.0
cp aionui-web-1.0.0-linux-x86_64.tar.gz /tmp/mock-releases/v1.0.0/
cp aionui-web-1.0.0-linux-x86_64.tar.gz.sha256 /tmp/mock-releases/v1.0.0/
cp scripts/install-web.sh /tmp/mock-releases/

# Run smoke test
bash scripts/smoke-test-install-web.sh file:///tmp/mock-releases 1.0.0
```

### 4. Commits

```
4d6cc3197 docs(m9): update handoff with Docker unavailability note
d8576c488 docs(m9): add M9 handoff document
780c7553e feat(ci): add smoke test for install-web.sh
14559c2ef feat(ci): add prepare-install-script job to pack-web-cli workflow
7ad1bb5cc feat(install-web): implement core installation functions
5e364a507 feat(install-web): add install-web.sh skeleton with CLI arg parsing
```

Base: `d71697fc5` (M8 handoff document)

## Usage Examples

### Online Installation (Recommended)

```bash
# Install latest version
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | bash

# Install specific version
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | VERSION=1.0.0 bash

# Install to custom directory
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | INSTALL_DIR=/opt/aionui-web bash
```

### Offline Installation (Local Mirror)

```bash
# 1. Download release assets to local directory
mkdir -p /path/to/releases/v1.0.0
cd /path/to/releases/v1.0.0
wget https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz
wget https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz.sha256

# 2. Download install-web.sh
cd /path/to/releases
wget https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/install-web.sh

# 3. Run installation (using file:// mirror)
MIRROR=file:///path/to/releases VERSION=1.0.0 bash install-web.sh
```

### Manual Installation (Fallback)

If install-web.sh has issues, users can manually extract tarball:

```bash
# 1. Download tarball
curl -LO https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz

# 2. Verify checksum (optional)
curl -LO https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz.sha256
shasum -a 256 -c aionui-web-1.0.0-linux-x86_64.tar.gz.sha256

# 3. Extract
tar -xzf aionui-web-1.0.0-linux-x86_64.tar.gz
mv aionui-web ~/.local/share/aionui-web

# 4. Create symlink
mkdir -p ~/.local/bin
ln -s ~/.local/share/aionui-web/bin/aionui-web.js ~/.local/bin/aionui-web

# 5. Add PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Uninstall

```bash
# Remove installation directory
rm -rf ~/.local/share/aionui-web

# Remove symlink
rm ~/.local/bin/aionui-web

# Remove PATH configuration (manual edit)
# Edit ~/.bashrc or ~/.zshrc and remove the line:
# export PATH="$HOME/.local/bin:$PATH"
```

## Test Results

### Local Verification

✅ **Skeleton test** (Phase 1):
- `--help` shows correct usage
- CLI argument parsing works

✅ **Platform detection** (Phase 2):
- darwin-arm64 detected on macOS Apple Silicon
- Tarball name constructed correctly

✅ **Full installation test** (Phase 2-9):
- file:// mirror download works
- SHA256 verification passes
- Extraction to temp directory succeeds
- Symlink created correctly
- Version command works

✅ **Smoke test** (Phase 11):
- smoke-test-install-web.sh passes with mock tarball
- All verification steps succeed

### CI Verification

⏸️ **CI workflow not executed** (per team-lead instruction: valid YAML + actionlint sufficient for feature branches)

**Expected CI flow**:
1. `pack-web-cli` job produces 5 platform tarballs
2. `prepare-install-script` job replaces `__VERSION__` and uploads install-web.sh
3. `smoke-test-install` job tests installation in debian:bookworm-slim

## Deviations from Plan

None. All phases executed as planned.

## Known Issues / Risks

### 1. Docker Unavailable (Local Testing)

**Risk**: Container smoke test requires Docker daemon

**Impact**: If Docker not available locally, smoke-test-install-web.sh may fail

**Mitigation**: 
- CI runs smoke test in GitHub Actions container
- Local testing uses file:// mirror without container
- Fallback: `bash -n` syntax check + `bash --help` output check

**Current State**: 
- ✅ Local file:// mirror smoke test passed
- ✅ Bash syntax check passed (bash -n)
- ✅ --help output verified
- ⏸️ Container smoke test skipped (Docker not available locally, will run in CI)

### 2. Windows Compatibility

**Risk**: install-web.sh is bash script, Windows native doesn't support it

**Impact**: Windows users need Git Bash / WSL / MSYS2

**Mitigation**: Documentation clarifies requirement

**Future**: Consider PowerShell version (install-web.ps1) in M10+

### 3. GitHub API Rate Limit

**Risk**: `resolve_version()` queries GitHub API, may hit rate limit

**Impact**: Installation fails if `latest` version cannot be resolved

**Mitigation**:
- User can specify explicit version: `VERSION=1.0.0 bash install-web.sh`
- CI replaces `__VERSION__` with actual version (no API call needed)

### 4. SHA256 Tool Missing

**Risk**: shasum/sha256sum may not be available on minimal systems

**Impact**: Checksum verification skipped with warning

**Mitigation**: Script warns but continues installation (most systems have one of these tools)

## Dependency Boundary Verification

✅ **install-web.sh dependencies**:
- curl or wget (for download)
- tar (for extraction)
- shasum or sha256sum (for checksum, optional)
- bash (shell)
- Node.js (for CLI runtime, bundled in tarball)

✅ **No external package dependencies**: All logic in pure bash

## Release Artifact Location

After M10 release automation, install-web.sh will be available at:

```
https://github.com/iOfficeAI/AionUi/releases/download/v{version}/install-web.sh
https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh (latest)
```

## Next Milestone (M10)

**M10: Release Automation**

**Dependencies from M9**:
- install-web.sh ready for GitHub releases upload
- `__VERSION__` placeholder replacement working in CI
- Smoke test validates installation flow

**M10 Tasks**:
- Modify `.github/workflows/build-and-release.yml` to include install-web.sh
- Upload install-web.sh to GitHub releases alongside tarballs
- Update README with installation instructions

**Interface for M10**:
- CI artifact: `install-web-script/install-web.sh` (with version replaced)
- Release asset: `install-web.sh` (one file, version-agnostic)

## Rollback Plan

If M9 breaks builds:

1. **Revert all M9 commits**:
   ```bash
   git revert 780c7553e 14559c2ef 7ad1bb5cc 5e364a507
   git push origin feat/m9-install-web-script
   ```

2. **Fallback to M8**:
   ```bash
   git checkout origin/feat/m8-web-cli-tarball
   ```

---

**Executor**: executor-m9 (Claude Sonnet 4.5 agent)  
**Completed**: 2026-05-08  
**Duration**: ~1 hour

---

**Status Summary**:

✅ **M9 Core Goal Achieved**: install-web.sh script + CI integration complete  
✅ **5-Platform Support**: darwin-arm64/x86_64, linux-x86_64/aarch64, win-x86_64  
✅ **Local Testing Passed**: file:// mirror smoke test successful  
✅ **CI Integration Ready**: prepare-install-script + smoke-test-install jobs added  
⏸️ **Container Test Deferred**: Docker not available locally, CI will run  
⏸️ **CI Not Executed**: YAML valid, awaiting real CI run after push  

**Release Readiness**: M9 feature branch is **code-complete** and ready for baseline sync + push.

**Human Review Needed**:
1. Verify CI workflow runs successfully after push
2. Test container smoke test in GitHub Actions
3. Review install-web.sh user experience on multiple platforms
