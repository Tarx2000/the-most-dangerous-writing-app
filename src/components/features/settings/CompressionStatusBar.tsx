/**
 * CompressionStatusBar — Normal-user visible compression progress indicator.
 *
 * Shows a compact card in Settings when there are active (queued or processing)
 * compression jobs. Displays:
 *   – Job count
 *   – Current progress bar for the active job
 *   – Failed count (if any)
 *
 * Completely hidden when the queue is idle — zero visual noise.
 */

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import type { CompressionQueueState } from '@/types';

interface CompressionStatusBarProps {
    compressionState: CompressionQueueState;
}

export const CompressionStatusBar: React.FC<CompressionStatusBarProps> = React.memo(function CompressionStatusBar({
    compressionState,
}) {
    const failedCount = compressionState.jobs.filter((j) => j.status === 'failed').length;
    const current = compressionState.currentJob;
    const progress = current?.progress ?? 0;

    // Progress bar fill — Reanimated scaleX (GPU) instead of legacy RN Animated
    // width with useNativeDriver:false (JS-thread layout animation).
    const progressAnim = useSharedValue(0);
    useEffect(() => {
        progressAnim.value = withTiming(progress, { duration: 300 });
    }, [progress, progressAnim]);
    const fillStyle = useAnimatedStyle(() => ({
        transform: [{ scaleX: progressAnim.value }],
    }));

    // Only show when there are queued, processing, or failed jobs
    const hasActivity = compressionState.pendingCount > 0 || compressionState.jobs.some((j) => j.status === 'failed');
    if (!hasActivity) return null;

    return (
        <View
            style={{
                backgroundColor: theme.colors.glassBackground,
                borderRadius: theme.borderRadius.md,
                padding: 16,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: failedCount > 0 ? theme.colors.dangerBorderStrong : theme.colors.glassBorder,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <MaterialCommunityIcons
                    name={compressionState.isProcessing ? 'loading' : 'zip-box-outline'}
                    size={18}
                    color={failedCount > 0 ? theme.colors.danger : theme.colors.primaryAction}
                />
                <Text style={{ color: theme.colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                    {compressionState.pendingCount > 0
                        ? `Compressing ${compressionState.pendingCount} video${compressionState.pendingCount !== 1 ? 's' : ''}`
                        : 'Compression Jobs'}
                </Text>
            </View>

            {current && current.status === 'processing' && (
                <View style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                            {current.presetId
                                ? `${current.presetId.charAt(0).toUpperCase() + current.presetId.slice(1)} preset`
                                : 'Processing'}
                        </Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                            {Math.round(progress * 100)}%
                        </Text>
                    </View>
                    <View
                        style={{
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: theme.colors.glassSurface,
                            overflow: 'hidden',
                        }}
                    >
                        <Animated.View
                            style={[
                                {
                                    width: '100%',
                                    height: 5,
                                    backgroundColor: theme.colors.primaryAction,
                                    borderRadius: 3,
                                },
                                fillStyle,
                            ]}
                        />
                    </View>
                </View>
            )}

            {failedCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.colors.danger} />
                    <Text style={{ color: theme.colors.danger, fontSize: 12, fontWeight: '600' }}>
                        {failedCount} job{failedCount !== 1 ? 's' : ''} failed — open Developer Tools for details
                    </Text>
                </View>
            )}
        </View>
    );
});
