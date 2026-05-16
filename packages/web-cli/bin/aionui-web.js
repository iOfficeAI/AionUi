#!/usr/bin/env node
import('../src/index.js').catch((err) => {
  console.error('Failed to start aionui-web:', err);
  process.exit(1);
});
