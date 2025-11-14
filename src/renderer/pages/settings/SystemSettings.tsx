import { ipcBridge } from '@/common';
import FontSizeControl from '@/renderer/components/FontSizeControl';
import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import ThemeSwitcher from '@/renderer/components/ThemeSwitcher';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Form, Input, Modal, Tooltip } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import SettingContainer from './components/SettingContainer';

// 目录选择输入组件 / Directory selection input component
const DirInputItem: React.FC<{
  label: string;
  field: string;
}> = (props) => {
  const { t } = useTranslation();
  return (
    <Form.Item label={props.label} field={props.field}>
      {(options, form) => {
        const currentValue = options[props.field] || '';

        const handlePick = () => {
          ipcBridge.dialog.showOpen
            .invoke({
              defaultPath: currentValue,
              properties: ['openDirectory', 'createDirectory'],
            })
            .then((data) => {
              if (data?.[0]) {
                form.setFieldValue(props.field, data[0]);
              }
            })
            .catch((error) => {
              console.error('Failed to open directory dialog:', error);
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
};

const SystemSettings: React.FC = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);

  // 获取系统目录信息 / Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // 初始化表单数据 / Initialize form data
  useEffect(() => {
    if (systemInfo) {
      form.setFieldValue('cacheDir', systemInfo.cacheDir);
      form.setFieldValue('workDir', systemInfo.workDir);
    }
  }, [systemInfo, form]);

  // 目录配置保存确认 / Directory configuration save confirmation
  const saveDirConfigValidate = (_values: { cacheDir: string; workDir: string }): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.restartConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  // 保存目录配置 / Save directory configuration
  const onSubmit = async () => {
    const values = await form.validate();
    const { cacheDir, workDir } = values;
    setLoading(true);
    setError(null);

    // 检查目录是否修改 / Check if directories are modified
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
      } catch (caughtError: unknown) {
        if (caughtError) {
          // 用户取消 / User cancelled
          setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

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
        className={'[&_.arco-row]:flex-nowrap max-w-800px'}
      >
        <Form.Item label={t('settings.language')} field={'language'}>
          <LanguageSwitcher></LanguageSwitcher>
        </Form.Item>
        <Form.Item label={t('settings.theme')} field={'theme'}>
          <ThemeSwitcher></ThemeSwitcher>
        </Form.Item>
        {/* 字体缩放设置 / Font scale setting */}
        <Form.Item label={t('settings.fontSize')} field={'fontScale'}>
          <FontSizeControl />
        </Form.Item>

        {/* 目录配置 / Directory configuration */}
        <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
        <DirInputItem label={t('settings.workDir')} field='workDir' />

        {error && <Alert className={'m-b-10px'} type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
      </Form>
      {modalContextHolder}
    </SettingContainer>
  );
};

export default SystemSettings;
