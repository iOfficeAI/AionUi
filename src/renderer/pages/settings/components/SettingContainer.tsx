import { Card, Divider } from '@arco-design/web-react';
import React from 'react';

const SettingContainer: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = (props) => {
  return (
    <Card title={props.title} className={'m-50px'}>
      {props.children}
      {props.footer && <Divider></Divider>}
      {props.footer}
    </Card>
  );
};

export default SettingContainer;
