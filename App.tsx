import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { WritingScreen } from './src/screens/WritingScreen';
import { PostWritingScreen } from './src/screens/PostWritingScreen';
import { VisionBoardScreen } from './src/screens/VisionBoardScreen';
import { AlignmentWritingScreen } from './src/screens/AlignmentWritingScreen';
import { VlogRecordingScreen } from './src/screens/VlogRecordingScreen';
import { RootStackParamList } from '@/types/navigation.types';
import { StatusBar } from 'react-native';
import { StorageProvider } from '@/lib/hooks/useStorage';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StorageProvider>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar hidden={true} translucent={true} />
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Writing" component={WritingScreen} />
            <Stack.Screen name="PostWriting" component={PostWritingScreen} />
            <Stack.Screen name="VisionBoard" component={VisionBoardScreen} />
            <Stack.Screen name="AlignmentWriting" component={AlignmentWritingScreen} />
            <Stack.Screen name="VlogRecording" component={VlogRecordingScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </StorageProvider>
    </GestureHandlerRootView>
  );
}
