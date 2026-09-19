import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SosScreen } from '../features/sos/SosScreen';
import { ContactsScreen } from '../features/contacts/ContactsScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#D7263D' }}>
        <Tab.Screen name="SOS" component={SosScreen} />
        <Tab.Screen name="Contacts" component={ContactsScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
