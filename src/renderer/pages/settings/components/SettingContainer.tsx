import { Card, Divider } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';

const SettingContainer: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  bodyContainer?: boolean;
  className?: string;
}> = (props) => {
  return (
    <Card title={props.title} className={'m-50px'} data-app-style='o-setting-group'>
      {props.children}
      {props.footer && <Divider></Divider>}
      {props.footer}
    </Card>
  );
};

export default SettingContainer;
