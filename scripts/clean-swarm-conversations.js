#!/usr/bin/env node
/**
 * Script to clean up dual-claude swarm conversations from database
 * This ensures fresh conversations will load the updated system prompts
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Get database path
const dbPath = path.join(os.homedir(), '.aionui', 'aionui.db');

console.log(`[CleanSwarm] Opening database: ${dbPath}`);

try {
  const db = new Database(dbPath);

  // Find all swarm conversations with dual-claude assistant
  const findStmt = db.prepare(`
    SELECT id, name, type, extra, created_at, updated_at
    FROM conversations
    WHERE type = 'swarm'
      AND json_extract(extra, '$.assistantId') = 'dual-claude'
  `);

  const swarmConversations = findStmt.all();

  console.log(`\n[CleanSwarm] Found ${swarmConversations.length} dual-claude swarm conversations`);

  if (swarmConversations.length === 0) {
    console.log('[CleanSwarm] No conversations to clean. Exiting.');
    db.close();
    process.exit(0);
  }

  // Show conversations
  console.log('\n[CleanSwarm] Conversations to delete:');
  swarmConversations.forEach((conv, i) => {
    const createdDate = new Date(conv.created_at).toLocaleString();
    const updatedDate = new Date(conv.updated_at).toLocaleString();
    console.log(`  ${i + 1}. ${conv.name}`);
    console.log(`     ID: ${conv.id}`);
    console.log(`     Created: ${createdDate}`);
    console.log(`     Updated: ${updatedDate}`);
  });

  // Delete conversations (this will cascade delete messages)
  console.log('\n[CleanSwarm] Deleting conversations...');
  const deleteStmt = db.prepare('DELETE FROM conversations WHERE id = ?');

  let deletedCount = 0;
  for (const conv of swarmConversations) {
    const result = deleteStmt.run(conv.id);
    deletedCount += result.changes;
    console.log(`[CleanSwarm] Deleted conversation: ${conv.name} (${conv.id})`);
  }

  console.log(`\n[CleanSwarm] Successfully deleted ${deletedCount} conversations`);
  console.log('[CleanSwarm] Messages were automatically deleted due to CASCADE constraint');

  // Verify deletion
  const remainingCount = findStmt.all().length;
  console.log(`[CleanSwarm] Remaining dual-claude swarm conversations: ${remainingCount}`);

  db.close();
  console.log('\n[CleanSwarm] ✅ Database cleanup complete');
  console.log('[CleanSwarm] Next steps:');
  console.log('  1. Restart the AionUi app to compile the debug code');
  console.log('  2. Create a new dual-claude conversation');
  console.log('  3. Check terminal logs for system prompt validation');
  console.log('  4. Test delegation with a simple task');

} catch (error) {
  console.error('[CleanSwarm] ❌ Error:', error.message);
  console.error(error);
  process.exit(1);
}
