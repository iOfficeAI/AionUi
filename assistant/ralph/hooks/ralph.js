/**
 * Ralph hooks — three-phase autonomous loop
 *
 * Flow:
 * 1. User sends: "Build feature X"
 * 2. onQueueInit → queues "/enrich <user request>"
 * 3. Turn 1: Claude enriches request → writes .ralph/prompt.md
 * 4. onAgentResponse: prompt.md exists, prd.json absent → queues "/prd"
 * 5. Turn 2: Claude reads prompt.md, asks clarifying questions, writes .ralph/prd.json
 * 6. onAgentResponse: prd.json exists → queues "/implement US-001"
 * 7. Turn N: Claude implements story, sets passes:true in prd.json
 * 8. onAgentResponse: reads prd.json → queues next incomplete story
 * 9. Continues until all stories have passes:true → hook stops queuing
 */

module.exports = {
  onQueueInit: {
    handler: async (context) => {
      if (!context.backend) return {};

      const userRequest = (context.content || '').trim();
      if (!userRequest) return {};

      return {
        queueMessages: [
          {
            content: `/enrich ${userRequest}`,
            priority: 'normal',
            source: 'system',
          },
        ],
      };
    },
    priority: 50,
  },

  onAgentResponse: {
    handler: async (context) => {
      if (!context.backend || !context.workspace) return {};

      const fs = require('fs');
      const path = require('path');
      const ralphDir = path.join(context.workspace, '.ralph');
      const promptPath = path.join(ralphDir, 'prompt.md');
      const prdPath = path.join(ralphDir, 'prd.json');

      // prompt.md written but prd.json not yet → queue /prd
      if (fs.existsSync(promptPath) && !fs.existsSync(prdPath)) {
        return {
          queueMessages: [
            {
              content: '/prd',
              priority: 'normal',
              source: 'system',
            },
          ],
        };
      }

      // prd.json exists → queue next incomplete story
      if (fs.existsSync(prdPath)) {
        let prd;
        try {
          prd = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
        } catch {
          return {};
        }

        const next = (prd.userStories || []).filter((s) => !s.passes).sort((a, b) => a.priority - b.priority)[0];

        if (!next) return {}; // all stories complete

        return {
          queueMessages: [
            {
              content: `/implement ${next.id}`,
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
