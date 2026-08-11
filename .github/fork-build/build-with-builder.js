#!/usr/bin/env node

/**
 * Fork-only build entry point for `Fork Manual Build Release`.
 *
 * It reuses the shared build pipeline while swapping in a fork-specific
 * `prepareAionrs` implementation, so upstream workflows stay untouched.
 */

const Module = require('module');
const path = require('path');

const sharedPreparePath = path.resolve(__dirname, '../../scripts/prepareAionrs.js');
const forkPreparePath = path.resolve(__dirname, './prepareAionrs.js');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === sharedPreparePath) {
      return originalLoad.call(this, forkPreparePath, parent, isMain);
    }
  } catch {
    // Fall through to Node's default resolution path.
  }

  return originalLoad.call(this, request, parent, isMain);
};

require(path.resolve(__dirname, '../../scripts/build-with-builder.js'));
