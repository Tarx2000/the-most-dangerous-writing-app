import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StartScreen } from './src/screens/StartScreen';
import { WritingScreen } from './src/screens/WritingScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { RootStackParamList } from './src/navigation/types';
import { StatusBar } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar hidden={true} translucent={true} />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Start" component={StartScreen} />
        <Stack.Screen name="Writing" component={WritingScreen} />
        <Stack.Screen name="Library" component={LibraryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
