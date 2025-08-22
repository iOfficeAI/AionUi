import { Card, Divider } from '@arco-design/web-react';
import React from 'react';
import { useThemeColors, useTextColor } from '../../../themes/index';

const SettingContainer: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = (props) => {
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();

  return (
    <Card
      title={props.title}
      className={'m-50px'}
      style={{
        backgroundColor: themeColors.surface,
        borderColor: themeColors.border,
        color: getTextColor('settings.container', 'textPrimary'),
      }}
      headerStyle={{
        backgroundColor: themeColors.surface,
        borderColor: themeColors.border,
        color: getTextColor('settings.container.title', 'textPrimary'),
      }}
      bodyStyle={{
        backgroundColor: themeColors.surface,
        color: getTextColor('settings.container', 'textPrimary'),
      }}
    >
      {props.children}
      {props.footer && <Divider></Divider>}
      {props.footer}
    </Card>
  );
};

export default SettingContainer;
