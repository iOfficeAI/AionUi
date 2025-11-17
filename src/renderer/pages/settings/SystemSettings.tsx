import { ipcBridge } from '@/common';
import FontSizeControl from '@/renderer/components/FontSizeControl';
import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/renderer/components/ThemeSwitcher';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Form, Modal, Tooltip } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import SettingContainer from './components/SettingContainer';

const SystemSettings: React.FC = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);

  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  useEffect(() => {
    if (systemInfo) {
      form.setFieldsValue({
        cacheDir: systemInfo.cacheDir,
        workDir: systemInfo.workDir,
      });
    }
  }, [systemInfo, form]);

  const saveDirConfigValidate = (values: { cacheDir: string; workDir: string }) => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.restartConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  const onSubmit = async () => {
    const values = await form.validate();
    const { cacheDir, workDir } = values;
    setLoading(true);
    setError(null);

    const needsRestart = cacheDir !== systemInfo?.cacheDir || workDir !== systemInfo?.workDir;

    if (needsRestart) {
      try {
        await saveDirConfigValidate(values);
        const result = await ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir });
        if (result.success) {
          await ipcBridge.application.restart.invoke();
        } else {
          setError(result.msg || 'Failed to update system info');
        }
      } catch (e: any) {
        if (e?.message) {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

  const DirInputItem: React.FC<{ label: string; field: string }> = ({ label, field }) => (
    <Form.Item label={label} field={field}>
      {(options, formInstance) => {
        const currentValue = options[field] || '';

        const handlePick = () => {
          ipcBridge.dialog.showOpen
            .invoke({
              defaultPath: currentValue,
              properties: ['openDirectory', 'createDirectory'],
            })
            .then((data) => {
              if (data?.[0]) {
                formInstance.setFieldValue(field, data[0]);
              }
            })
            .catch((err) => {
              console.error('Failed to open directory dialog:', err);
            });
        };

        return (
          <div className='aion-dir-input w-full flex items-center gap-10px rounded-8px border border-solid border-transparent px-14px py-10px' onClick={handlePick}>
            <Tooltip content={currentValue || t('settings.dirNotConfigured')} position='top'>
              <span className='flex-1 min-w-0 text-13px text-t-primary truncate max-w-[220px]'>{currentValue || t('settings.dirNotConfigured')}</span>
            </Tooltip>
            <Button
              size='mini'
              type='outline'
              icon={<FolderOpen theme='outline' size='18' fill={iconColors.primary} />}
              onClick={(e) => {
                e.stopPropagation();
                handlePick();
              }}
            />
          </div>
        );
      }}
    </Form.Item>
  );

  return (
    <SettingContainer
      title={t('settings.system')}
      bodyContainer
      footer={
        <div className='flex justify-center gap-10px'>
          <Button type='primary' loading={loading} onClick={onSubmit}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        labelCol={{
          span: 5,
          flex: '200px',
        }}
        wrapperCol={{
          flex: '1',
        }}
        className='[&_.arco-row]:flex-nowrap max-w-800px'
      >
        <Form.Item label={t('settings.language')} field='language'>
          <LanguageSwitcher />
        </Form.Item>
        <Form.Item label={t('settings.theme')} field='theme'>
          <ThemeSwitcher />
        </Form.Item>
        <Form.Item label={t('settings.fontSize')} field='fontScale'>
          <FontSizeControl />
        </Form.Item>

        <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
        <DirInputItem label={t('settings.workDir')} field='workDir' />

        {error && <Alert className='m-b-10px' type='error' content={error} />}
      </Form>
      {modalContextHolder}
    </SettingContainer>
  );
};

export default SystemSettings;
