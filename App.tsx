import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the native splash screen from auto-hiding before our assets/fonts are loaded.
SplashScreen.preventAutoHideAsync().catch(() => {
    /* ignore */
});

// Custom React Navigation theme to match our AMOLED true black background
const navigationTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background: theme.colors.background,
    },
};
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { WritingScreen } from './src/screens/WritingScreen';
import { PostWritingScreen } from './src/screens/PostWritingScreen';
import { PillarsDashboardScreen } from './src/screens/PillarsDashboardScreen';
import { PillarDetailScreen } from './src/screens/PillarDetailScreen';
import { AlignmentWritingScreen } from './src/screens/AlignmentWritingScreen';
import { VlogRecordingScreen } from './src/screens/VlogRecordingScreen';
import { SandboxScreen } from './src/screens/SandboxScreen';
import { RootStackParamList } from '@/types/navigation.types';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StorageProvider } from '@/lib/hooks/useStorage';
import { AiQueueProvider } from '@/lib/hooks/useAiQueueProvider';
import { CompressionQueueProvider } from '@/lib/hooks/useCompressionQueueProvider';
import { PinProvider } from '@/lib/hooks/usePinProvider';
import { SecurityProvider } from '@/lib/hooks/useSecurity';
import { PinPadModal } from '@/components/ui/PinPadModal';
import { ErrorBoundary, withErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useFonts } from 'expo-font';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
 * Root UI gate — renders the navigation tree and global modals.
 * AI configuration is intentionally NOT shown on first launch anymore: the
 * first-run API-key setup form was a developer-facing gate on a journaling
 * product. AI is configured on demand from Settings.
 */
function AiConfigGate() {
    return (
        <>
            <NavigationContainer theme={navigationTheme}>
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
                    <Stack.Screen name="PillarsDashboard" component={WrappedPillarsDashboardScreen} />
                    <Stack.Screen name="PillarDetail" component={WrappedPillarDetailScreen} />
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
        </>
    );
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const WrappedHomeScreen = withErrorBoundary(HomeScreen);
const WrappedWritingScreen = withErrorBoundary(WritingScreen);
const WrappedPostWritingScreen = withErrorBoundary(PostWritingScreen);
const WrappedPillarsDashboardScreen = withErrorBoundary(PillarsDashboardScreen);
const WrappedPillarDetailScreen = withErrorBoundary(PillarDetailScreen);
const WrappedAlignmentWritingScreen = withErrorBoundary(AlignmentWritingScreen);
const WrappedVlogRecordingScreen = withErrorBoundary(VlogRecordingScreen);
const WrappedSandboxScreen = withErrorBoundary(SandboxScreen);

function AppContent() {
    const [fontsLoaded] = useFonts({
        ...MaterialCommunityIcons.font,
        PlayfairDisplay_400Regular,
        SpaceMono_400Regular,
        Caveat_400Regular,
        Lora_400Regular,
        ZillaSlab_400Regular,
        CrimsonPro_400Regular,
        DMSans_400Regular,
        EagleLake_400Regular,
    });

    // Dismiss the native splash screen once fonts are loaded to ensure a seamless AMOLED transition
    useEffect(() => {
        if (fontsLoaded) {
            SplashScreen.hideAsync().catch(() => {
                /* ignore */
            });
        }
    }, [fontsLoaded]);

    // Performance: the provider tree mounts IMMEDIATELY so StorageProvider's
    // loadAllData() (SQLite open + migrations + queries) runs IN PARALLEL with
    // font loading instead of waiting for it. Only the visible UI (NavigationContainer
    // + modals) is gated on fontsLoaded. This removes the sequential bottleneck
    // "fonts -> data" from the cold-start critical path.
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <StorageProvider>
                    <PinProvider>
                        <SecurityProvider>
                            <AiQueueProvider>
                                <CompressionQueueProvider>
                                    {fontsLoaded ? <AiConfigGate /> : null}
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
