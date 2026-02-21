/**
 * Auto-setup hook for AI Analyst (Genome)
 *
 * Automatically initializes a new workspace when a conversation is created:
 * 1. onWorkspaceInit: Creates required directories and runs setup.sh
 * 2. onFirstMessage: Injects genome context so the agent knows the environment status
 */

const MARKER_FILE = '.initialized';

module.exports = {
  /**
   * onWorkspaceInit — Set up the workspace environment
   *
   * - Creates required working directories (_working/, outputs/, data/cache/)
   * - Runs setup.sh to install Python dependencies (vnstock, pandas, scipy, etc.)
   * - Writes .initialized marker to prevent re-running on subsequent sessions
   */
  onWorkspaceInit: {
    handler: async (context) => {
      const { workspace, utils } = context;
      if (!utils) return;

      try {
        // Check if already initialized
        const markerPath = utils.join(workspace, MARKER_FILE);
        if (await utils.exists(markerPath)) {
          return;
        }

        // Create required working directories
        const dirs = ['_working', 'outputs', 'data/cache'];
        for (const dir of dirs) {
          await utils.ensureDir(utils.join(workspace, dir));
        }

        // Run setup.sh if it exists
        const setupPath = utils.join(workspace, 'setup.sh');
        if (await utils.exists(setupPath)) {
          const { execSync } = require('child_process');
          try {
            execSync(`bash "${setupPath}"`, {
              cwd: workspace,
              stdio: 'pipe',
              timeout: 120000, // 2 minute timeout for pip installs
              env: { ...process.env, HOME: process.env.HOME || '/root' },
            });
          } catch (setupError) {
            // Non-fatal — log warning but don't block workspace creation
            console.warn(
              '[ai-analyst-genome] setup.sh warning:',
              setupError.message
            );
          }
        }

        // Write marker file
        await utils.writeFile(markerPath, new Date().toISOString());
      } catch (error) {
        console.warn(
          '[ai-analyst-genome] Workspace init warning:',
          error.message
        );
      }
    },
    priority: 10, // HIGH — run before other hooks
  },

  /**
   * onFirstMessage — Inject environment context into the first user message
   *
   * Tells the agent whether the environment is ready and what data platform is available,
   * so it can respond appropriately (e.g., skip setup instructions if already initialized).
   */
  onFirstMessage: {
    handler: async (context) => {
      const { workspace, utils, content } = context;
      if (!utils || !content) return {};

      try {
        const markerPath = utils.join(workspace, MARKER_FILE);
        const configPath = utils.join(workspace, 'genome_config.yaml');
        const isInitialized = await utils.exists(markerPath);
        const hasConfig = await utils.exists(configPath);

        if (isInitialized && hasConfig) {
          const prefix =
            '[AI Analyst Environment Ready]\n' +
            'Workspace is initialized with vnstock data platform. ' +
            'Configuration: genome_config.yaml, data_sources.yaml. ' +
            'Helpers, agents, skills, and templates are available.\n\n';
          return { content: prefix + content };
        }

        if (!isInitialized) {
          const prefix =
            '[AI Analyst Environment: Setup Pending]\n' +
            'The Python environment may not be fully initialized. ' +
            'Run `bash setup.sh` if dependencies are missing.\n\n';
          return { content: prefix + content };
        }
      } catch {
        // Silently ignore — don't break the message flow
      }

      return {};
    },
    priority: 50,
  },
};
