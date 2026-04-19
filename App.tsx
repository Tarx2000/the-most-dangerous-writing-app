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
import { SandboxScreen } from './src/screens/SandboxScreen';
import { RootStackParamList } from '@/types/navigation.types';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { StorageProvider } from '@/lib/hooks/useStorage';
import { AiQueueProvider } from '@/lib/hooks/useAiQueueProvider';
import { PinProvider } from '@/lib/hooks/usePinProvider';
import { PinPadModal } from '@/components/ui/PinPadModal';
import { ErrorBoundary, withErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useFonts } from 'expo-font';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { Lora_400Regular } from '@expo-google-fonts/lora';
import { ZillaSlab_400Regular } from '@expo-google-fonts/zilla-slab';
import { CrimsonPro_400Regular } from '@expo-google-fonts/crimson-pro';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans';
import { EagleLake_400Regular } from '@expo-google-fonts/eagle-lake';
import { initHapticsMiddleware } from '@/lib/haptics';
import { mark as perfMark } from '@/lib/perf';

// Initialize global haptics middleware
initHapticsMiddleware();

// Mark app entry for perf tracking (dev-mode only, gated inside perf module)
perfMark('app.entry');

// Global error handlers — catch unhandled errors that escape React boundaries
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    console.error('[GlobalErrorHandler]', isFatal ? 'FATAL' : 'NON-FATAL', error);
    if (originalHandler) originalHandler(error, isFatal);
  });
}

// Catch unhandled promise rejections that escape try/catch
if (typeof globalThis !== 'undefined') {
  const originalRejectionHandler = (globalThis as any). HermesInternal?.getUnhandledRejectionHandler?.();
  // React Native (Hermes) fires unhandled promise events through the global error handler
  // above — this is a safety net for any that slip through
  const rejectionTracking = (globalThis as any).__rejectionTracking;
  if (rejectionTracking?.setUnhandledRejectionHandler) {
    rejectionTracking.setUnhandledRejectionHandler((id: string, error: Error) => {
      console.error('[UnhandledPromise]', id, error);
    });
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppContent() {
  const [fontsLoaded] = useFonts({
    ...MaterialCommunityIcons.font,
    ...Feather.font,
    PlayfairDisplay_400Regular,
    SpaceMono_400Regular,
    Caveat_400Regular,
    Lora_400Regular,
    ZillaSlab_400Regular,
    CrimsonPro_400Regular,
    DMSans_400Regular,
    EagleLake_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  perfMark('fonts.loaded');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StorageProvider>
        <PinProvider>
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
              <Stack.Screen name="Sandbox" component={withErrorBoundary(SandboxScreen)} />
            </Stack.Navigator>
          </NavigationContainer>
          <PinPadModal />
          </AiQueueProvider>
        </PinProvider>
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

