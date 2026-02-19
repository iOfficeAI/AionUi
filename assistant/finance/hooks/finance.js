/**
 * Finance Research Assistant hooks
 *
 * onConversationInit: checks for .initialized marker in the workspace.
 * If missing, queues a message instructing Claude to run setup.sh before
 * proceeding with any analysis. This ensures Python dependencies are
 * installed on first run.
 */

module.exports = {
  onConversationInit: {
    handler: async (context) => {
      if (!context.workspace) return {};

      const fs = require('fs');
      const path = require('path');

      const marker = path.join(context.workspace, '.initialized');
      if (!fs.existsSync(marker)) {
        return {
          queueMessages: [
            {
              content: ['The Finance Research workspace needs a one-time Python setup before any analysis can run.', 'Please run the following command now:', '', '```bash', 'bash setup.sh', '```', '', 'Wait for the "Environment ready" confirmation, then proceed with the user\'s request.'].join('\n'),
              priority: 'normal',
              source: 'system',
            },
          ],
        };
      }

      return {};
    },
    priority: 50,
  },
};
