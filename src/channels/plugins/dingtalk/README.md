# DingTalk Plugin

DingTalk bot integration using `dingtalk-stream` SDK for WebSocket Stream connection.

## File Structure

| File                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `DingTalkPlugin.ts`  | Core plugin: connection, AI Card streaming, message sending |
| `DingTalkAdapter.ts` | Message format conversion (DingTalk ↔ Unified)              |
| `DingTalkCards.ts`   | Static card builders (help, settings, action cards)         |

## AI Card Streaming

Uses DingTalk's built-in AI Card template (`382e4302-551d-4880-bf29-a30acfab2e71.schema`) for real-time streaming responses.

### State Machine

```
PROCESSING (1) → INPUTING (2) → FINISHED (3)
                                  FAILED (5)
```

### API Call Sequence

```
1. POST /v1.0/card/instances          # Create card
   - cardTemplateId, outTrackId
   - callbackType: 'STREAM'           # Required for streaming
   - imGroupOpenSpaceModel / imRobotOpenSpaceModel

2. POST /v1.0/card/instances/deliver   # Deliver to chat
   - openSpaceId: 'dtv1.card//IM_GROUP.{id}' or 'dtv1.card//IM_ROBOT.{id}'
   - userIdType: 1                     # Required
   - spaceType: 'IM_ROBOT' (not 'ONE_BOX')

3. PUT /v1.0/card/instances            # Set INPUTING state (once, before first stream)
   - flowStatus: '2'
   - sys_full_json_obj: '{"order":["msgContent"]}'

4. PUT /v1.0/card/streaming            # Stream content (repeat)
   - key: 'msgContent'                 # Not 'content'
   - isFull: true                      # Full replacement (AionUI sends complete content each time)
   - isFinalize: false                 # Not 'isFinish'
   - isError: false

5. PUT /v1.0/card/streaming            # Final stream
   - Same as above, but isFinalize: true

6. PUT /v1.0/card/instances            # Set FINISHED state
   - flowStatus: '3'
   - msgContent: finalContent
```

### Key Gotchas

- **`callbackType: 'STREAM'`** must be set on card creation, otherwise streaming API returns HTTP 500
- **`userIdType: 1`** is required on delivery, otherwise the card won't appear
- **`spaceType`** must be `'IM_ROBOT'` for 1:1 chats (not `'ONE_BOX'`)
- **`key`** in streaming must be `'msgContent'` (not `'content'`)
- **`isFinalize`** is the correct field name (not `'isFinish'`)
- **INPUTING state** must be set via `PUT /v1.0/card/instances` before the first streaming write
- **FINISHED state** must be set after streaming ends, or the "..." animation keeps spinning
- **`isFull: true`** is always used because AionUI sends the complete message content on each edit (not incremental deltas)

## Message Flow

```
DingTalk User → Stream WebSocket → DingTalkPlugin.handleRobotMessage()
  → ActionExecutor.handleIncomingMessage()
    → ChannelMessageService.sendMessage()
      → Agent (Gemini/ACP/Codex)
        → ChannelEventBus 'finish' event → Promise resolves
      → ActionExecutor sends final editMessage with replyMarkup
        → DingTalkPlugin.editMessage(isFinal=true)
          → streamAICard(isFinalize=true) + finishAICard()
```

## Fallback

If AI Card creation/streaming fails, the plugin falls back to:

1. `sessionWebhook` (cached from incoming messages)
2. DingTalk Open API (`/v1.0/robot/oToMessages/batchSend` or `/v1.0/robot/groupMessages/send`)
