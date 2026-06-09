/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ModalWrapper from '@renderer/components/base/ModalWrapper';
import { Spin, Typography } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Copied to renderer output via Vite `publicDir` (repo `public/`). */
const NOTICES_URL = './THIRD_PARTY_NOTICES.md';

const ThirdPartyNoticesModal: React.FC<{
  visible: boolean;
  onCancel: () => void;
}> = ({ visible, onCancel }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(NOTICES_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((body) => {
        if (!cancelled) {
          setText(body);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setText('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <ModalWrapper
      visible={visible}
      onCancel={onCancel}
      title={t('settings.thirdPartyNotices')}
      footer={null}
      style={{ width: 720, maxWidth: '92vw' }}
      className='third-party-notices-modal'
    >
      <Typography.Paragraph className='text-13px text-t-secondary mb-12px'>
        {t('settings.thirdPartyNoticesDescription')}
      </Typography.Paragraph>
      {loading ? (
        <div className='flex justify-center py-32px'>
          <Spin />
        </div>
      ) : error ? (
        <Typography.Text type='error' className='text-13px'>
          {t('settings.thirdPartyNoticesLoadFailed', { error })}
        </Typography.Text>
      ) : (
        <pre className='text-12px text-t-primary leading-relaxed whitespace-pre-wrap break-words max-h-60vh overflow-y-auto p-12px rd-8px bg-fill-2 border border-border-2 font-mono'>
          {text}
        </pre>
      )}
    </ModalWrapper>
  );
};

export default ThirdPartyNoticesModal;