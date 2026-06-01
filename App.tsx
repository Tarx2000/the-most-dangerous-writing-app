import React, { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { WritingScreen } from './src/screens/WritingScreen';
import { PostWritingScreen } from './src/screens/PostWritingScreen';
import { VisionBoardScreen } from './src/screens/VisionBoardScreen';
import { AlignmentWritingScreen } from './src/screens/AlignmentWritingScreen';
import { VlogRecordingScreen } from './src/screens/VlogRecordingScreen';
import { SandboxScreen } from './src/screens/SandboxScreen';
import { RootStackParamList } from '@/types/navigation.types';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StorageProvider, useAiConfig } from '@/lib/hooks/useStorage';
import { AiQueueProvider } from '@/lib/hooks/useAiQueueProvider';
import { CompressionQueueProvider } from '@/lib/hooks/useCompressionQueueProvider';
import { PinProvider } from '@/lib/hooks/usePinProvider';
import { SecurityProvider } from '@/lib/hooks/useSecurity';
import { PinPadModal } from '@/components/ui/PinPadModal';
import { ApiKeySetupModal } from '@/components/features/settings/ApiKeySetupModal';
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
import { mark as perfMark } from '@/lib/perf';
import { theme } from '@/styles/theme';
import { isApiKeyConfigured } from '@/config/ai';

// Initialize global haptics middleware

import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Disable the strict mode warning for reading/writing shared values during render
configureReanimatedLogger({
    level: ReanimatedLogLevel.warn,
    strict: false,
});

// Mark app entry for perf tracking (dev-mode only, gated inside perf module)
perfMark('app.entry');

// Global error handlers — catch unhandled errors that escape React boundaries
if (typeof ErrorUtils !== 'undefined') {
    try {
        const originalHandler = ErrorUtils.getGlobalHandler();
        ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
            console.error('[GlobalErrorHandler]', isFatal ? 'FATAL' : 'NON-FATAL', error);
            if (originalHandler) originalHandler(error, isFatal);
        });
    } catch {
        // ErrorUtils may not be available on some runtimes
    }
}

// Catch unhandled promise rejections (Hermes-specific, guarded)
if (typeof globalThis !== 'undefined') {
    try {
        // Hermes fires unhandled promise events through the global error handler
        // above — this is a safety net for any that slip through
        const _global = globalThis as unknown as Record<string, unknown>;
        const rejectionTracking = _global.__rejectionTracking as
            | {
                  setUnhandledRejectionHandler?: (handler: (id: string, error: Error) => void) => void;
              }
            | undefined;
        if (rejectionTracking?.setUnhandledRejectionHandler) {
            rejectionTracking.setUnhandledRejectionHandler((id: string, error: Error) => {
                console.error('[UnhandledPromise]', id, error);
            });
        }
    } catch {
        // Rejection tracking may not be available on all runtimes
    }
}

/**
 * Inner gate that shows the API key setup modal on first launch.
 * Lives inside StorageProvider so it can read/write aiConfig.
 */
function AiConfigGate() {
    const { aiApiKey, aiBaseUrl, aiModel, saveAiApiKey, saveAiBaseUrl, saveAiModel } = useAiConfig();
    const [hasSkipped, setHasSkipped] = useState(false);

    const showSetup = !hasSkipped && !isApiKeyConfigured({ apiKey: aiApiKey });

    return (
        <>
            <NavigationContainer theme={DarkTheme}>
                <StatusBar hidden={true} translucent={true} />
                <Stack.Navigator
                    screenOptions={{
                        headerShown: false,
                        animation: 'fade',
                        contentStyle: { backgroundColor: theme.colors.background },
                    }}
                >
                    <Stack.Screen name="Home" component={WrappedHomeScreen} />
                    {/*
                      TypeScript types for native-stack do not expose detachPreviousScreen,
                      but the underlying react-native-screens library uses it to prevent
                      unloading the background screen on Android. We cast as any to bypass.
                    */}
                    <Stack.Screen
                        name="Writing"
                        component={WrappedWritingScreen}
                        options={
                            {
                                animation: 'none',
                                presentation: 'transparentModal',
                                contentStyle: { backgroundColor: 'transparent' },
                                detachPreviousScreen: false,
                            } as unknown as NativeStackNavigationOptions
                        }
                    />
                    <Stack.Screen
                        name="PostWriting"
                        component={WrappedPostWritingScreen}
                        options={
                            {
                                animation: 'fade',
                                presentation: 'transparentModal',
                                contentStyle: { backgroundColor: 'transparent' },
                                detachPreviousScreen: false,
                            } as unknown as NativeStackNavigationOptions
                        }
                    />
                    <Stack.Screen name="VisionBoard" component={WrappedVisionBoardScreen} />
                    <Stack.Screen
                        name="AlignmentWriting"
                        component={WrappedAlignmentWritingScreen}
                        options={
                            {
                                animation: 'none',
                                presentation: 'transparentModal',
                                contentStyle: { backgroundColor: 'transparent' },
                                detachPreviousScreen: false,
                            } as unknown as NativeStackNavigationOptions
                        }
                    />
                    <Stack.Screen name="VlogRecording" component={WrappedVlogRecordingScreen} />
                    <Stack.Screen name="Sandbox" component={WrappedSandboxScreen} />
                </Stack.Navigator>
            </NavigationContainer>
            <PinPadModal />
            <ApiKeySetupModal
                visible={showSetup}
                initialKey={aiApiKey}
                initialBaseUrl={aiBaseUrl}
                initialModel={aiModel}
                onSave={(key, url, m) => {
                    saveAiApiKey(key);
                    saveAiBaseUrl(url);
                    saveAiModel(m);
                }}
                onSkip={() => setHasSkipped(true)}
            />
        </>
    );
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const WrappedHomeScreen = withErrorBoundary(HomeScreen);
const WrappedWritingScreen = withErrorBoundary(WritingScreen);
const WrappedPostWritingScreen = withErrorBoundary(PostWritingScreen);
const WrappedVisionBoardScreen = withErrorBoundary(VisionBoardScreen);
const WrappedAlignmentWritingScreen = withErrorBoundary(AlignmentWritingScreen);
const WrappedVlogRecordingScreen = withErrorBoundary(VlogRecordingScreen);
const WrappedSandboxScreen = withErrorBoundary(SandboxScreen);

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
            <View
                style={{
                    flex: 1,
                    backgroundColor: theme.colors.background,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <ActivityIndicator size="large" color={theme.colors.textPrimary} />
            </View>
        );
    }

    perfMark('fonts.loaded');

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <StorageProvider>
                    <PinProvider>
                        <SecurityProvider>
                            <AiQueueProvider>
                                <CompressionQueueProvider>
                                    <AiConfigGate />
                                </CompressionQueueProvider>
                            </AiQueueProvider>
                        </SecurityProvider>
                    </PinProvider>
                </StorageProvider>
            </SafeAreaProvider>
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
