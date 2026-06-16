'use strict';

// Pure, testable logic for deep-signing the bundled CPython tree
// (Contents/Resources/python/**) so Apple notarization accepts the embedded
// interpreter + extension modules. No side effects, no real `codesign` calls:
// I/O (fs walk, running codesign) is injected so this module can be unit-tested
// without Apple credentials. See docs/bundled-python.md (S3) and scripts/afterSign.js.

const path = require('path');

// Mach-O dynamic-library / extension-module file extensions found in a
// python-build-standalone tree. `.so` = CPython C-extension (lib-dynload),
// `.dylib` = shared libs (libpython, libssl, libcrypto, libffi, …).
const MACHO_EXTENSIONS = ['.so', '.dylib'];

// The bundled interpreter, relative to the python root. This is the binary that
// loads (JITs into) the signed .so extension modules, so it must carry the
// python entitlements (allow-jit / unsigned-exec-mem / disable-library-validation).
const INTERPRETER_RELATIVE = path.join('bin', 'python3.12');

// Resource-relative location of the bundled python root inside a packaged .app:
// <App>.app/Contents/Resources/python/. extraResources maps build/bundled-python/python -> python.
const PYTHON_RESOURCE_SUBDIR = 'python';

function isMachOByExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MACHO_EXTENSIONS.includes(ext);
}

// Is this entry the bundled interpreter (…/python/bin/python3.12)?
function isInterpreter(filePath, pythonRoot) {
  return path.resolve(filePath) === path.resolve(path.join(pythonRoot, INTERPRETER_RELATIVE));
}

// Walk `pythonRoot` and return every Mach-O file we must sign. Detection is
// twofold so we are robust to extensionless or oddly-named binaries:
//   1. extension match (.so/.dylib), OR
//   2. the file lives under bin/ and is regular+executable (covers python3.12,
//      python3, and any helper executables shipped in bin/), OR
//   3. an injected `probeMachO(filePath)` returns true (e.g. a `file`/`codesign -d`
//      probe wired in by the caller) — lets the real hook catch framework
//      binaries with no extension.
// `fsDeps` injects directory traversal so the walk is unit-testable.
function enumerateMachOFiles(pythonRoot, fsDeps, probeMachO) {
  const readdirSync = fsDeps.readdirSync;
  const statSync = fsDeps.statSync;
  const found = [];

  function isExecutable(mode) {
    // any execute bit set (owner/group/other)
    return (mode & 0o111) !== 0;
  }

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink && entry.isSymbolicLink()) {
        // Skip symlinks: codesign the real target, never the alias (signing a
        // symlink path resolves to the target anyway and risks double-signing).
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      if (isMachOByExtension(fullPath)) {
        found.push(fullPath);
        continue;
      }

      const inBin = path.dirname(fullPath) === path.join(pythonRoot, 'bin');
      if (inBin) {
        let mode = 0;
        try {
          mode = statSync(fullPath).mode;
        } catch {
          mode = 0;
        }
        if (isExecutable(mode)) {
          found.push(fullPath);
          continue;
        }
      }

      if (typeof probeMachO === 'function' && probeMachO(fullPath)) {
        found.push(fullPath);
      }
    }
  }

  walk(pythonRoot);
  return found;
}

// Order the Mach-O files INSIDE-OUT so a parent never gets signed before its
// children. codesign seals a Mach-O by hashing its own bytes (and, for the
// app/bundle, its nested code) — if you sign python3.12 first and then re-sign a
// .so it loads, the interpreter's signature no longer covers the new .so hash and
// notarization/Gatekeeper rejects it. So: deepest-first by path-segment count,
// and the interpreter (bin/python3.12) ALWAYS last. The .app outer re-sign is a
// separate step the caller performs after this list.
function orderInsideOut(files, pythonRoot) {
  const depthOf = (f) => path.resolve(f).split(path.sep).length;
  return [...files].sort((a, b) => {
    const aInterp = isInterpreter(a, pythonRoot);
    const bInterp = isInterpreter(b, pythonRoot);
    if (aInterp && !bInterp) return 1; // interpreter sorts last
    if (bInterp && !aInterp) return -1;
    const depthDiff = depthOf(b) - depthOf(a); // deeper first
    if (depthDiff !== 0) return depthDiff;
    return a < b ? -1 : a > b ? 1 : 0; // stable, deterministic
  });
}

// Build the `codesign` argv for one Mach-O. Hardened runtime + secure timestamp
// for everyone; the interpreter (and only it) gets the python entitlements plist
// so the signed interpreter is allowed to JIT and load the signed .so modules
// without library-validation rejecting them.
//   leaf .dylib/.so : --force --options runtime --timestamp --sign <id>
//   python3.12      : … --entitlements <pythonEntitlementsPlist>
function buildCodesignArgs(filePath, { identity, pythonRoot, entitlementsPlist }) {
  if (!identity) {
    throw new Error('buildCodesignArgs: missing signing identity');
  }
  const args = ['--force', '--options', 'runtime', '--timestamp'];
  if (isInterpreter(filePath, pythonRoot) && entitlementsPlist) {
    args.push('--entitlements', entitlementsPlist);
  }
  args.push('--sign', identity, filePath);
  return args;
}

// Build the codesign argv that RE-SEALS the outer .app so its signature covers
// the freshly re-signed python tree. --deep is intentionally NOT used (it would
// re-sign nested code with the app's own entitlements and clobber the python
// entitlements we just applied); we only re-seal the top-level bundle.
function buildAppResignArgs(appPath, { identity, appEntitlementsPlist }) {
  if (!identity) {
    throw new Error('buildAppResignArgs: missing signing identity');
  }
  const args = ['--force', '--options', 'runtime', '--timestamp'];
  if (appEntitlementsPlist) {
    args.push('--entitlements', appEntitlementsPlist);
  }
  args.push('--sign', identity, appPath);
  return args;
}

// Resolve <app>.app/Contents/Resources/python from an .app path.
function resolvePythonRoot(appPath) {
  return path.join(appPath, 'Contents', 'Resources', PYTHON_RESOURCE_SUBDIR);
}

// Produce the full, ordered list of codesign argv to run for the python tree,
// inside-out, given an already-enumerated file list. The caller runs each argv
// with the injected codesign runner, then runs buildAppResignArgs for the .app.
function planPythonCodesign(files, opts) {
  const ordered = orderInsideOut(files, opts.pythonRoot);
  return ordered.map((filePath) => ({
    filePath,
    args: buildCodesignArgs(filePath, opts),
    isInterpreter: isInterpreter(filePath, opts.pythonRoot),
  }));
}

module.exports = {
  MACHO_EXTENSIONS,
  INTERPRETER_RELATIVE,
  PYTHON_RESOURCE_SUBDIR,
  isMachOByExtension,
  isInterpreter,
  enumerateMachOFiles,
  orderInsideOut,
  buildCodesignArgs,
  buildAppResignArgs,
  resolvePythonRoot,
  planPythonCodesign,
};
