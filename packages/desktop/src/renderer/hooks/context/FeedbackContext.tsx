/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import FeedbackReportModal, {
  type PrefilledScreenshot,
} from '@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal';

type OpenFeedbackOptions = {
  module?: string;
  autoScreenshot?: boolean;
};

type FeedbackContextValue = {
  openFeedback: (options?: OpenFeedbackOptions) => Promise<void>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const captureScreenshot = async (): Promise<PrefilledScreenshot | null> => {
  const capture = window.electronAPI?.captureFeedbackScreenshot;
  if (!capture) return null;
  try {
    const result = await capture();
    if (!result) return null;
    return {
      filename: result.filename,
      data: new Uint8Array(result.data),
      type: 'image/png',
    };
  } catch {
    return null;
  }
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [defaultModule, setDefaultModule] = useState<string | undefined>(undefined);
  const [prefilledScreenshots, setPrefilledScreenshots] = useState<PrefilledScreenshot[] | undefined>(undefined);

  const openFeedback = useCallback(async (options?: OpenFeedbackOptions) => {
    setDefaultModule(options?.module);
    if (options?.autoScreenshot) {
      const shot = await captureScreenshot();
      setPrefilledScreenshots(shot ? [shot] : undefined);
    } else {
      setPrefilledScreenshots(undefined);
    }
    setVisible(true);
  }, []);

  const handleCancel = useCallback(() => {
    setVisible(false);
    setPrefilledScreenshots(undefined);
  }, []);

  const value = useMemo(() => ({ openFeedback }), [openFeedback]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackReportModal
        visible={visible}
        onCancel={handleCancel}
        defaultModule={defaultModule}
        prefilledScreenshots={prefilledScreenshots}
      />
    </FeedbackContext.Provider>
  );
};

export const useFeedback = (): FeedbackContextValue => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    // Fallback so consumers don't crash when the provider isn't mounted (e.g. web build).
    return {
      openFeedback: async () => {
        /* no-op */
      },
    };
  }
  return ctx;
};
