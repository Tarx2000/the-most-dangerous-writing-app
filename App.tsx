import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { WritingScreen } from './src/screens/WritingScreen';
import { VisionBoardScreen } from './src/screens/VisionBoardScreen';
import { AlignmentWritingScreen } from './src/screens/AlignmentWritingScreen';
import { VlogRecordingScreen } from './src/screens/VlogRecordingScreen';
import { RootStackParamList } from '@/types/navigation.types';
import { StatusBar } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={DarkTheme}>
        <StatusBar hidden={true} translucent={true} />
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Writing" component={WritingScreen} />
          <Stack.Screen name="VisionBoard" component={VisionBoardScreen} />
          <Stack.Screen name="AlignmentWriting" component={AlignmentWritingScreen} />
          <Stack.Screen name="VlogRecording" component={VlogRecordingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
