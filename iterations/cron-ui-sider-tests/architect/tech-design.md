# Test Design: zk/feat/cron-ui-sider Branch

## Batch 1: Core Logic (P0) - Node
1. `tests/unit/chatLib.test.ts` — transformMessage for skill_suggest/cron_trigger types, composeMessage with cronMeta
2. `tests/unit/CronStore.test.ts` — jobToRow/rowToJob round-trips, CRUD ops
3. `tests/unit/ConversationServiceImpl.test.ts` — deleteConversation removes cron jobs, createWithMigration
4. `tests/unit/renderer/groupingHelpers.test.ts` — isCronJobConversation, buildGroupedHistory filtering

## Batch 2: Bridge & Database (P1) - Node
1. `tests/unit/cronBridge.test.ts` — IPC provider registration
2. `tests/unit/conversationBridge.test.ts` — listByCronJob, createWithConversation migration
3. `tests/unit/migrations.test.ts` — getMigrationsToRun, v19/v20/v21
4. `tests/unit/SqliteConversationRepository.test.ts` — getConversationsByCronJob

## Batch 3: Renderer Functions + Components (P1) - Mixed
1. `tests/unit/renderer/cronUtils.test.ts` — formatSchedule, formatNextRun, getJobStatusFlags
2. `tests/unit/renderer/conversation/CreateTaskDialog.dom.test.tsx` — parseCronExpr, form render
3. `tests/unit/renderer/conversation/SkillSuggestCard.dom.test.tsx` — save/dismiss/preview
4. `tests/unit/renderer/conversation/CronJobSiderItem.dom.test.tsx` — navigation, expand

## Batch 4: Sider & Page Components (P2) - jsdom
1. `tests/unit/renderer/conversation/CronJobSiderSection.dom.test.tsx`
2. `tests/unit/renderer/conversation/ScheduledTasksPage.dom.test.tsx`
3. `tests/unit/renderer/conversation/TaskDetailPage.dom.test.tsx`
4. `tests/unit/renderer/conversation/Sider.dom.test.tsx`

## Batch 5: Utilities (P2) - Mixed
1. `tests/unit/renderer/siderTooltip.dom.test.ts`
2. `tests/unit/ConversationSearchPopover.dom.test.tsx`
