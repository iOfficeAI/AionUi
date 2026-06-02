import type { IMessageOpencodeError } from '@/common/chat/chatLib';
import { Button, Card, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const COMPACT_ENABLED = false;

const metaString = (metadata: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
};

const metaNumber = (metadata: Record<string, unknown> | undefined, key: string): number | undefined => {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : undefined;
};

const OpencodeErrorCard: React.FC<{ message: IMessageOpencodeError }> = ({ message }) => {
  const { t } = useTranslation();
  const { kind, metadata } = message.content;
  if (kind === 'aborted') return null;
  if (kind === 'unknown') {
    return <Typography.Text type='error'>{message.content.message}</Typography.Text>;
  }
  const title = t(`conversation.remoteOpencodeError.${kind}.title`, { defaultValue: message.content.message });
  const providerId = metaString(metadata, 'provider_id');
  const used = metaNumber(metadata, 'used');
  const limit = metaNumber(metadata, 'limit');
  const statusCode = metaNumber(metadata, 'status_code');
  const body = metaString(metadata, 'body');
  const schema = metaString(metadata, 'schema');
  return (
    <Card className='max-w-640px border-solid border-1 border-danger/30' size='small' title={title}>
      {kind === 'context_overflow' && (
        <div className='flex flex-col gap-8px'>
          <Typography.Text>
            {t('conversation.remoteOpencodeError.context_overflow.body', {
              used: used ?? 'unknown',
              limit: limit ?? 'unknown',
              defaultValue: `Context window full (${used ?? 'unknown'} / ${limit ?? 'unknown'} tokens).`,
            })}
          </Typography.Text>
          {COMPACT_ENABLED ? <Button size='mini'>{t('conversation.remoteOpencodeError.context_overflow.compact')}</Button> : null}
        </div>
      )}
      {kind === 'provider_auth' && (
        <div className='flex items-center gap-8px'>
          <Typography.Text>
            {t('conversation.remoteOpencodeError.provider_auth.body', {
              providerId: providerId ?? 'provider',
              defaultValue: `Provider auth failed for ${providerId ?? 'provider'}.`,
            })}
          </Typography.Text>
          <Button size='mini' type='primary' onClick={() => { window.location.hash = '/settings/agents'; }}>
            {t('conversation.remoteOpencodeError.provider_auth.reconnect')}
          </Button>
        </div>
      )}
      {kind === 'output_length' && <Button size='mini'>{t('conversation.remoteOpencodeError.output_length.continue')}</Button>}
      {kind === 'api' && (
        <div className='flex flex-col gap-8px'>
          <Typography.Text>{t('conversation.remoteOpencodeError.api.status', { statusCode: statusCode ?? 'unknown' })}</Typography.Text>
          {body ? <Typography.Paragraph copyable code>{body}</Typography.Paragraph> : null}
        </div>
      )}
      {kind === 'structured_output' && (
        <div className='flex flex-col gap-8px'>
          <Typography.Text>{t('conversation.remoteOpencodeError.structured_output.schema', { schema: schema ?? 'schema' })}</Typography.Text>
          <Typography.Paragraph code>{JSON.stringify(metadata?.partial ?? {}, null, 2)}</Typography.Paragraph>
        </div>
      )}
    </Card>
  );
};

export default OpencodeErrorCard;
