import React from 'react';
import { useTranslation } from 'react-i18next';

const ConversationEmptyState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='flex-center size-full' style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, var(--bg-4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.3,
          maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
        }}
      />
      <p style={{ color: 'var(--text-disabled)', fontSize: 14, zIndex: 1, margin: 0 }}>
        {t('conversation.emptyState', 'Start a conversation...')}
      </p>
    </div>
  );
};

export default ConversationEmptyState;
