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
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { StorageProvider } from '@/lib/hooks/useStorage';
import { AiQueueProvider } from '@/lib/hooks/useAiQueueProvider';
import { ErrorBoundary, withErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useFonts } from 'expo-font';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppContent() {
  const [fontsLoaded] = useFonts({
    ...MaterialCommunityIcons.font,
    ...Feather.font,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StorageProvider>
        <AiQueueProvider>
          <NavigationContainer theme={DarkTheme}>
            <StatusBar hidden={true} translucent={true} />
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }}>
              <Stack.Screen name="Home" component={withErrorBoundary(HomeScreen)} />
              <Stack.Screen name="Writing" component={withErrorBoundary(WritingScreen)} />
              <Stack.Screen name="PostWriting" component={withErrorBoundary(PostWritingScreen)} />
              <Stack.Screen name="VisionBoard" component={withErrorBoundary(VisionBoardScreen)} />
              <Stack.Screen name="AlignmentWriting" component={withErrorBoundary(AlignmentWritingScreen)} />
              <Stack.Screen name="VlogRecording" component={withErrorBoundary(VlogRecordingScreen)} />
            </Stack.Navigator>
          </NavigationContainer>
        </AiQueueProvider>
      </StorageProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

