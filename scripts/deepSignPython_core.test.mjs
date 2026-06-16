import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  isMachOByExtension,
  isInterpreter,
  enumerateMachOFiles,
  orderInsideOut,
  buildCodesignArgs,
  buildAppResignArgs,
  resolvePythonRoot,
  planPythonCodesign,
  INTERPRETER_RELATIVE,
} = require('./deepSignPython_core.js');

const IDENTITY = 'Developer ID Application: FYN Labs LLC (NHNQ7Q5H28)';
const PY_ROOT = '/out/mac-arm64/Command EVE.app/Contents/Resources/python';
const INTERP = path.join(PY_ROOT, INTERPRETER_RELATIVE);
const PY_ENTITLEMENTS = '/repo/python-entitlements.plist';
const APP_ENTITLEMENTS = '/repo/entitlements.plist';

// --- Mach-O detection -------------------------------------------------------

test('isMachOByExtension recognizes .so and .dylib (case-insensitive)', () => {
  assert.equal(isMachOByExtension('/x/lib-dynload/_ssl.cpython-312-darwin.so'), true);
  assert.equal(isMachOByExtension('/x/lib/libpython3.12.dylib'), true);
  assert.equal(isMachOByExtension('/x/lib/libSSL.DYLIB'), true);
});

test('isMachOByExtension rejects plain data / text files', () => {
  assert.equal(isMachOByExtension('/x/lib/python3.12/os.py'), false);
  assert.equal(isMachOByExtension('/x/lib/python3.12/LICENSE.txt'), false);
  assert.equal(isMachOByExtension('/x/bin/python3.12'), false); // extensionless -> not by extension
});

test('isInterpreter matches only python/bin/python3.12', () => {
  assert.equal(isInterpreter(INTERP, PY_ROOT), true);
  assert.equal(isInterpreter(path.join(PY_ROOT, 'lib/libpython3.12.dylib'), PY_ROOT), false);
});

// --- enumerate (mocked fs) --------------------------------------------------

// Build a fake fs tree from a flat path->{dir|file, mode} map.
function makeFakeFs(tree) {
  function entriesOf(dir) {
    const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
    const names = new Set();
    for (const p of Object.keys(tree)) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const name = rest.split(path.sep)[0];
      if (name) names.add(name);
    }
    return [...names].map((name) => {
      const full = path.join(dir, name);
      const node = tree[full];
      const isDir = !node || node.type === 'dir' || Object.keys(tree).some((p) => p.startsWith(full + path.sep));
      const isFileNode = node && node.type === 'file';
      return {
        name,
        isDirectory: () => isDir && !isFileNode,
        isFile: () => !!isFileNode,
        isSymbolicLink: () => !!(node && node.type === 'symlink'),
      };
    });
  }
  return {
    readdirSync: (dir) => entriesOf(dir),
    statSync: (p) => ({ mode: (tree[p] && tree[p].mode) || 0o644 }),
    existsSync: (p) => p in tree || Object.keys(tree).some((k) => k.startsWith(p + path.sep)),
  };
}

test('enumerateMachOFiles finds .so, .dylib and the bin interpreter; skips .py and symlinks', () => {
  const tree = {
    [path.join(PY_ROOT, 'bin/python3.12')]: { type: 'file', mode: 0o755 },
    [path.join(PY_ROOT, 'bin/python3')]: { type: 'symlink' }, // symlink -> skipped
    [path.join(PY_ROOT, 'bin/idle')]: { type: 'file', mode: 0o644 }, // non-exec in bin -> skipped
    [path.join(PY_ROOT, 'lib/libpython3.12.dylib')]: { type: 'file', mode: 0o644 },
    [path.join(PY_ROOT, 'lib/python3.12/lib-dynload/_ssl.cpython-312-darwin.so')]: { type: 'file', mode: 0o644 },
    [path.join(PY_ROOT, 'lib/python3.12/os.py')]: { type: 'file', mode: 0o644 },
    [path.join(PY_ROOT, 'lib/libssl.3.dylib')]: { type: 'file', mode: 0o644 },
  };
  const found = enumerateMachOFiles(PY_ROOT, makeFakeFs(tree)).sort();
  assert.deepEqual(found.sort(), [
    path.join(PY_ROOT, 'bin/python3.12'),
    path.join(PY_ROOT, 'lib/libpython3.12.dylib'),
    path.join(PY_ROOT, 'lib/libssl.3.dylib'),
    path.join(PY_ROOT, 'lib/python3.12/lib-dynload/_ssl.cpython-312-darwin.so'),
  ].sort());
});

test('enumerateMachOFiles uses the probe fallback for extensionless framework binaries', () => {
  const fwBin = path.join(PY_ROOT, 'lib/Frameworks/Python.framework/Versions/3.12/Python');
  const tree = {
    [fwBin]: { type: 'file', mode: 0o644 }, // not .so/.dylib, not in bin/
  };
  const probe = (p) => p === fwBin;
  const found = enumerateMachOFiles(PY_ROOT, makeFakeFs(tree), probe);
  assert.deepEqual(found, [fwBin]);
});

// --- inside-out ordering ----------------------------------------------------

test('orderInsideOut signs deepest leaves first and the interpreter LAST', () => {
  const files = [
    INTERP,
    path.join(PY_ROOT, 'lib/libpython3.12.dylib'),
    path.join(PY_ROOT, 'lib/python3.12/lib-dynload/_ssl.cpython-312-darwin.so'),
    path.join(PY_ROOT, 'lib/libssl.3.dylib'),
  ];
  const ordered = orderInsideOut(files, PY_ROOT);
  // interpreter is strictly last
  assert.equal(ordered[ordered.length - 1], INTERP);
  // the deep lib-dynload .so comes before the shallower top-level dylibs
  const soIdx = ordered.indexOf(path.join(PY_ROOT, 'lib/python3.12/lib-dynload/_ssl.cpython-312-darwin.so'));
  const dylibIdx = ordered.indexOf(path.join(PY_ROOT, 'lib/libpython3.12.dylib'));
  assert.ok(soIdx < dylibIdx, 'deep .so must be signed before shallow .dylib');
});

test('orderInsideOut is deterministic for equal depths', () => {
  const files = [path.join(PY_ROOT, 'lib/b.dylib'), path.join(PY_ROOT, 'lib/a.dylib')];
  assert.deepEqual(orderInsideOut(files, PY_ROOT), [
    path.join(PY_ROOT, 'lib/a.dylib'),
    path.join(PY_ROOT, 'lib/b.dylib'),
  ]);
});

// --- codesign arg construction ---------------------------------------------

test('buildCodesignArgs gives leaf libs hardened-runtime + timestamp, NO entitlements', () => {
  const lib = path.join(PY_ROOT, 'lib/libssl.3.dylib');
  assert.deepEqual(buildCodesignArgs(lib, { identity: IDENTITY, pythonRoot: PY_ROOT, entitlementsPlist: PY_ENTITLEMENTS }), [
    '--force',
    '--options',
    'runtime',
    '--timestamp',
    '--sign',
    IDENTITY,
    lib,
  ]);
});

test('buildCodesignArgs gives the interpreter the python entitlements plist', () => {
  assert.deepEqual(
    buildCodesignArgs(INTERP, { identity: IDENTITY, pythonRoot: PY_ROOT, entitlementsPlist: PY_ENTITLEMENTS }),
    ['--force', '--options', 'runtime', '--timestamp', '--entitlements', PY_ENTITLEMENTS, '--sign', IDENTITY, INTERP]
  );
});

test('buildCodesignArgs throws without an identity (never sign ad-hoc by accident)', () => {
  assert.throws(() => buildCodesignArgs(INTERP, { identity: '', pythonRoot: PY_ROOT }), /missing signing identity/);
});

test('buildAppResignArgs re-seals the .app with app entitlements and NO --deep', () => {
  const app = '/out/mac-arm64/Command EVE.app';
  const args = buildAppResignArgs(app, { identity: IDENTITY, appEntitlementsPlist: APP_ENTITLEMENTS });
  assert.deepEqual(args, [
    '--force',
    '--options',
    'runtime',
    '--timestamp',
    '--entitlements',
    APP_ENTITLEMENTS,
    '--sign',
    IDENTITY,
    app,
  ]);
  assert.ok(!args.includes('--deep'), 'outer re-seal must NOT use --deep (would clobber python entitlements)');
});

// --- resolvePythonRoot ------------------------------------------------------

test('resolvePythonRoot points at Contents/Resources/python', () => {
  assert.equal(
    resolvePythonRoot('/out/mac-arm64/Command EVE.app'),
    '/out/mac-arm64/Command EVE.app/Contents/Resources/python'
  );
});

// --- full plan --------------------------------------------------------------

test('planPythonCodesign produces an inside-out, interpreter-last codesign plan', () => {
  const files = [
    INTERP,
    path.join(PY_ROOT, 'lib/python3.12/lib-dynload/_ssl.cpython-312-darwin.so'),
    path.join(PY_ROOT, 'lib/libpython3.12.dylib'),
  ];
  const plan = planPythonCodesign(files, {
    identity: IDENTITY,
    pythonRoot: PY_ROOT,
    entitlementsPlist: PY_ENTITLEMENTS,
  });
  // last step is the interpreter, and only it carries entitlements
  const last = plan[plan.length - 1];
  assert.equal(last.isInterpreter, true);
  assert.ok(last.args.includes('--entitlements'));
  assert.equal(last.args.includes(PY_ENTITLEMENTS), true);
  // every earlier step is a leaf without entitlements
  for (const step of plan.slice(0, -1)) {
    assert.equal(step.isInterpreter, false);
    assert.ok(!step.args.includes('--entitlements'));
  }
});
