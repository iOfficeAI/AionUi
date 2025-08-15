/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolCallStatus } from "./types.js";

/**
 * Maps a CoreToolScheduler status to the UI's ToolCallStatus enum.
 */
function mapCoreStatusToDisplayStatus(coreStatus) {
  switch (coreStatus) {
    case "validating":
      return ToolCallStatus.Executing;
    case "awaiting_approval":
      return ToolCallStatus.Confirming;
    case "executing":
      return ToolCallStatus.Executing;
    case "success":
      return ToolCallStatus.Success;
    case "cancelled":
      return ToolCallStatus.Canceled;
    case "error":
      return ToolCallStatus.Error;
    case "scheduled":
      return ToolCallStatus.Pending;
    default: {
      const exhaustiveCheck = coreStatus;
      console.warn(`Unknown core status encountered: ${exhaustiveCheck}`);
      return ToolCallStatus.Error;
    }
  }
}
/**
 * Transforms `TrackedToolCall` objects into `HistoryItemToolGroup` objects for UI display.
 */
export function mapToDisplay(toolOrTools) {
  const toolCalls = Array.isArray(toolOrTools) ? toolOrTools : [toolOrTools];
  const toolDisplays = toolCalls.map((trackedCall) => {
    let displayName = trackedCall.request.name;
    let description = "";
    let renderOutputAsMarkdown = false;
    const currentToolInstance =
      "tool" in trackedCall && trackedCall.tool ? trackedCall.tool : undefined;
    if (currentToolInstance) {
      displayName = currentToolInstance.displayName;
      description = currentToolInstance.getDescription(
        trackedCall.request.args
      );
      renderOutputAsMarkdown = currentToolInstance.isOutputMarkdown;
    } else if ("request" in trackedCall && "args" in trackedCall.request) {
      description = JSON.stringify(trackedCall.request.args);
    }
    const baseDisplayProperties = {
      callId: trackedCall.request.callId,
      name: displayName,
      description,
      renderOutputAsMarkdown,
    };
    switch (trackedCall.status) {
      case "success":
        return {
          ...baseDisplayProperties,
          status: mapCoreStatusToDisplayStatus(trackedCall.status),
          resultDisplay: trackedCall.response.resultDisplay,
          confirmationDetails: undefined,
        };
      case "error":
        return {
          ...baseDisplayProperties,
          name: currentToolInstance?.displayName ?? trackedCall.request.name,
          status: mapCoreStatusToDisplayStatus(trackedCall.status),
          resultDisplay: trackedCall.response.resultDisplay,
          confirmationDetails: undefined,
        };
      case "cancelled":
        return {
          ...baseDisplayProperties,
          status: mapCoreStatusToDisplayStatus(trackedCall.status),
          resultDisplay: trackedCall.response.resultDisplay,
          confirmationDetails: undefined,
        };
      case "awaiting_approval":
        return {
          ...baseDisplayProperties,
          status: mapCoreStatusToDisplayStatus(trackedCall.status),
          resultDisplay: undefined,
          confirmationDetails: trackedCall.confirmationDetails,
        };
      case "executing":
        return {
          ...baseDisplayProperties,
          status: mapCoreStatusToDisplayStatus(trackedCall.status),
          resultDisplay: trackedCall.liveOutput ?? undefined,
          confirmationDetails: undefined,
        };
      case "validating": // Fallthrough
      case "scheduled":
        return {
          ...baseDisplayProperties,
          status: mapCoreStatusToDisplayStatus(trackedCall.status),
          resultDisplay: undefined,
          confirmationDetails: undefined,
        };
      default: {
        const exhaustiveCheck = trackedCall;
        return {
          callId: exhaustiveCheck.request.callId,
          name: "Unknown Tool",
          description: "Encountered an unknown tool call state.",
          status: ToolCallStatus.Error,
          resultDisplay: "Unknown tool call state",
          confirmationDetails: undefined,
          renderOutputAsMarkdown: false,
        };
      }
    }
  });
  return {
    type: "tool_group",
    tools: toolDisplays,
  };
}
//# sourceMappingURL=useReactToolScheduler.js.map
