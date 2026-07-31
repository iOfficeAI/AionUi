#!/usr/bin/env node
import('../src/index.js').catch((err) => {
  console.error('Failed to start csbu-workmate-web:', err);
  process.exit(1);
});
