import React from 'react';
import { Drawer } from 'expo-router/drawer';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { WorkspaceFilesSidebar } from '../../../src/components/files/WorkspaceFilesSidebar';
import { useThemeColor } from '../../../src/hooks/useThemeColor';

function DrawerContent(props: DrawerContentComponentProps) {
  return <WorkspaceFilesSidebar navigation={props.navigation} />;
}

export default function FilesDrawerLayout() {
  const background = useThemeColor({}, 'background');

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { width: '85%', backgroundColor: background },
      }}
    >
      <Drawer.Screen name='index' options={{ drawerLabel: 'Files', title: 'Files' }} />
    </Drawer>
  );
}
