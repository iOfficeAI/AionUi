/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// Only defining the state enum needed by the UI
export var StreamingState;
(function (StreamingState) {
  StreamingState["Idle"] = "idle";
  StreamingState["Responding"] = "responding";
  StreamingState["WaitingForConfirmation"] = "waiting_for_confirmation";
})(StreamingState || (StreamingState = {}));
// Copied from server/src/core/turn.ts for CLI usage
export var GeminiEventType;
(function (GeminiEventType) {
  GeminiEventType["Content"] = "content";
  GeminiEventType["ToolCallRequest"] = "tool_call_request";
  // Add other event types if the UI hook needs to handle them
})(GeminiEventType || (GeminiEventType = {}));
export var ToolCallStatus;
(function (ToolCallStatus) {
  ToolCallStatus["Pending"] = "Pending";
  ToolCallStatus["Canceled"] = "Canceled";
  ToolCallStatus["Confirming"] = "Confirming";
  ToolCallStatus["Executing"] = "Executing";
  ToolCallStatus["Success"] = "Success";
  ToolCallStatus["Error"] = "Error";
})(ToolCallStatus || (ToolCallStatus = {}));
// Message types used by internal command feedback (subset of HistoryItem types)
export var MessageType;
(function (MessageType) {
  MessageType["INFO"] = "info";
  MessageType["ERROR"] = "error";
  MessageType["USER"] = "user";
  MessageType["ABOUT"] = "about";
  MessageType["STATS"] = "stats";
  MessageType["MODEL_STATS"] = "model_stats";
  MessageType["TOOL_STATS"] = "tool_stats";
  MessageType["QUIT"] = "quit";
  MessageType["GEMINI"] = "gemini";
  MessageType["COMPRESSION"] = "compression";
})(MessageType || (MessageType = {}));
//# sourceMappingURL=types.js.map
