#!/bin/bash

# Create PR command for ACP Integration branch
gh pr create \
  --title "Feature: ACP (AI Code Protocol) Integration and Chat History Recovery Improvements" \
  --body "## Summary
This branch implements comprehensive ACP (AI Code Protocol) support for multi-backend AI integration, along with significant improvements to chat history data recovery and management.

## Key Features

### ACP Protocol Integration
- Full implementation of ACP (AI Code Protocol) for seamless integration with various AI backends
- Support for multiple AI providers including Qwen and other ACP-compatible models
- Dynamic CLI path detection and automatic backend discovery
- Secure authentication flow with OAuth support
- Real-time connection status monitoring and management

### Data Recovery & Storage Improvements
- Direct ID-based conversation recovery from storage files
- Eliminated default value assumptions - using only actual message data
- Enhanced conversation type detection based on message content
- Fixed conversation naming to prioritize user input over AI responses
- Improved data integrity during app restarts

### Architecture Enhancements
- New \`AcpAdapter\` for protocol handling
- \`AcpAgentTask\` for managing ACP sessions
- \`AcpConnection\` for WebSocket communication
- \`AcpDetector\` for automatic CLI detection
- Reusable React hooks for multi-agent detection and message replacement

### UI/UX Improvements
- Backend-specific visual indicators and logos
- Real-time connection status display
- Enhanced loading states and error handling
- Improved workspace management interface

## Technical Details

### New Components
- \`src/adapter/AcpAdapter.ts\` - Core protocol adapter
- \`src/process/AcpConnection.ts\` - WebSocket connection handler  
- \`src/process/AcpDetector.ts\` - CLI detection system
- \`src/process/task/AcpAgentTask.ts\` - Task management
- \`src/hooks/useMultiAgentDetection.tsx\` - Multi-agent detection hook
- \`src/hooks/useMessageReplacement.ts\` - Message replacement logic

### Modified Systems
- Enhanced \`initBridge.ts\` with ACP conversation support
- Improved \`initStorage.ts\` with robust data recovery
- Updated \`WorkerManage.ts\` for ACP task handling
- Refactored conversation components for multi-backend support

## Testing
- Tested with multiple ACP backends (Qwen, etc.)
- Verified conversation persistence and recovery
- Confirmed proper message display and replacement
- Validated authentication flows and connection handling

## Compatibility
- Fully backward compatible with existing Gemini conversations
- Automatic migration for legacy data formats
- No breaking changes to existing functionality" \
  --base main \
  --web