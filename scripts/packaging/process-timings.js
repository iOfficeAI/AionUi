// Optional Node preload for electron-builder only. Observe process completion
// without changing arguments, callbacks, streams, signing policy or exit codes.
const fs = require('node:fs');
const cp = require('node:child_process');
const { promisify } = require('node:util');

function classify(file, args) {
  const name = String(file).replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (/^7z(?:a)?(?:\.exe)?$/.test(name) && args?.[0] === 'a') return 'archive-compression';
  if (/^(?:signtool|osslsigncode)(?:\.exe)?$/.test(name)) return 'code-signing';
  if (/^makensis(?:\.exe)?$/.test(name)) return 'installer-compilation';
  return null;
}

if (process.env.BUILDER_PROCESS_TIMINGS === 'true' && process.env.BUILD_STAGE_REPORT) {
  const observed = new WeakSet();
  for (const method of ['spawn', 'execFile']) {
    const original = cp[method];
    const wrapper = function (...args) {
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const child = original.apply(this, args);
      const stage = classify(args[0], args[1]);
      if (!stage || observed.has(child)) return child;
      observed.add(child);
      child.once('close', (exitCode, signal) => {
        const record = {
          stage,
          startedAt,
          elapsedMs: Math.round(performance.now() - start),
          status: exitCode === 0 ? 'ok' : 'failed',
          exitCode,
          signal,
          compressionLevel: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || null,
        };
        try {
          fs.appendFileSync(process.env.BUILD_STAGE_REPORT, `${JSON.stringify(record)}\n`);
        } catch {
          console.warn('[build-stage] Process timing evidence could not be persisted');
        }
      });
      return child;
    };
    if (original[promisify.custom])
      Object.defineProperty(wrapper, promisify.custom, Object.getOwnPropertyDescriptor(original, promisify.custom));
    cp[method] = wrapper;
  }
}

module.exports = { classify };
