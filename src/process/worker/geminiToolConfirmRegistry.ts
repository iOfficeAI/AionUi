type DeferredResolver = {
  resolve?: (value: unknown) => void;
};

type WorkerPipe = {
  once: (eventName: string, handler: (confirmKey: string, deferred?: DeferredResolver) => void) => void;
};

type SerializableConfirmationDetails = Record<string, unknown> & {
  onConfirm?: (key: string) => void;
};

type ConfirmableTool = Record<string, unknown> & {
  callId: string;
  confirmationDetails?: SerializableConfirmationDetails;
};

export function createGeminiToolConfirmRegistry(pipe: WorkerPipe) {
  const registeredConfirmCallIds = new Set<string>();
  const confirmCallbacks = new Map<string, (key: string) => void>();

  const sanitizeTool = <T extends ConfirmableTool>(tool: T): T => {
    const confirmationDetails = tool.confirmationDetails;
    if (!confirmationDetails?.onConfirm) {
      confirmCallbacks.delete(tool.callId);
      return tool;
    }

    const { onConfirm, ...details } = confirmationDetails;
    confirmCallbacks.set(tool.callId, onConfirm);

    if (!registeredConfirmCallIds.has(tool.callId)) {
      registeredConfirmCallIds.add(tool.callId);
      pipe.once(tool.callId, (confirmKey: string, deferred?: DeferredResolver) => {
        const latestOnConfirm = confirmCallbacks.get(tool.callId);
        registeredConfirmCallIds.delete(tool.callId);
        confirmCallbacks.delete(tool.callId);
        latestOnConfirm?.(confirmKey);
        deferred?.resolve?.(undefined);
      });
    }

    return {
      ...tool,
      confirmationDetails: details,
    };
  };

  return {
    sanitizeTool,
  };
}
