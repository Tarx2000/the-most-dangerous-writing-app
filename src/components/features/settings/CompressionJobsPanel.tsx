/**
 * CompressionJobsPanel -- Full troubleshooting panel for video compression.
 *
 * Displays every active, queued, and failed compression job with:
 *   -- Real-time progress bars
 *   -- Preset name, status, elapsed time
 *   -- Per-job cancel / retry actions
 *   -- Bulk actions: Clear Pending, Retry All Failed
 *
 * Only visible inside DeveloperToolsPanel when devMode is ON.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { vibrate } from '@/lib/haptics';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import type { CompressionQueueState, CompressionJob } from '@/types';

interface CompressionJobsPanelProps {
    compressionState: CompressionQueueState;
    onCancel: (jobId: string) => void;
    onRetry: (jobId: string) => void;
    onClearPending: () => void;
}

const JobRow: React.FC<{
    job: CompressionJob;
    onCancel: () => void;
    onRetry: () => void;
}> = ({ job, onCancel, onRetry }) => {
    const isQueued = job.status === 'queued';
    const isProcessing = job.status === 'processing';
    const isFailed = job.status === 'failed';
    const isCancelled = job.status === 'cancelled';
    const progress = job.progress ?? 0;

    // Status color and icon
    let statusColor = theme.colors.textMuted;
    let statusIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'clock-outline';
    let statusLabel = 'Queued';
    if (isProcessing) {
        statusColor = theme.colors.primaryAction;
        statusIcon = 'loading';
        statusLabel = 'Processing';
    } else if (isFailed) {
        statusColor = theme.colors.danger;
        statusIcon = 'alert-circle-outline';
        statusLabel = 'Failed';
    } else if (isCancelled) {
        statusColor = theme.colors.textMuted;
        statusIcon = 'close-circle-outline';
        statusLabel = 'Cancelled';
    }

    // Elapsed / time label
    let timeLabel = '';
    if (isProcessing && job.startedAt) {
        const elapsedSec = Math.round((Date.now() - job.startedAt) / 1000);
        timeLabel = `${Math.floor(elapsedSec / 60)}:${(elapsedSec % 60).toString().padStart(2, '0')} elapsed`;
    } else if (job.createdAt) {
        const ageSec = Math.round((Date.now() - job.createdAt) / 1000);
        if (ageSec < 60) timeLabel = 'Just now';
        else if (ageSec < 3600) timeLabel = `${Math.floor(ageSec / 60)}m ago`;
        else timeLabel = `${Math.floor(ageSec / 3600)}h ago`;
    }

    return (
        <View
            style={{
                backgroundColor: theme.colors.glassSurfaceLow,
                borderRadius: theme.borderRadius.sm,
                padding: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: isFailed ? theme.colors.dangerBorderStrong : theme.colors.glassBorder,
            }}
        >
            {/* Row 1: status + preset + time */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MaterialCommunityIcons name={statusIcon} size={14} color={statusColor} />
                <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                    {statusLabel}
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}> | {timeLabel}</Text>
            </View>

            {/* Row 2: vlog ID */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginBottom: 4 }} numberOfLines={1}>
                {job.vlogId}
            </Text>

            {/* Row 3: progress or error */}
            {isProcessing ? (
                <View style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>
                            {job.presetId
                                ? `${job.presetId.charAt(0).toUpperCase() + job.presetId.slice(1)} preset`
                                : ''}
                        </Text>
                        <Text style={{ color: theme.colors.primaryAction, fontSize: 10, fontWeight: '700' }}>
                            {Math.round(progress * 100)}%
                        </Text>
                    </View>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.glassSurface }}>
                        <View
                            style={{
                                height: 4,
                                width: `${Math.round(progress * 100)}%`,
                                borderRadius: 2,
                                backgroundColor: theme.colors.primaryAction,
                            }}
                        />
                    </View>
                </View>
            ) : isFailed ? (
                <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: theme.colors.danger, fontSize: 11 }}>{job.error || 'Unknown error'}</Text>
                    {job.retryCount > 0 && (
                        <Text style={{ color: theme.colors.textMuted, fontSize: 10, marginTop: 2 }}>
                            Retries: {job.retryCount}/{2}
                        </Text>
                    )}
                </View>
            ) : null}

            {/* Row 4: actions */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {(isQueued || isCancelled) && (
                    <Pressable
                        onPress={() => {
                            vibrate(10);
                            onCancel();
                        }}
                        style={{
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            backgroundColor: theme.colors.dangerFill,
                            borderRadius: 6,
                        }}
                    >
                        <Text style={{ color: theme.colors.danger, fontSize: 11, fontWeight: '600' }}>Cancel</Text>
                    </Pressable>
                )}
                {isProcessing && (
                    <View
                        style={{
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            backgroundColor: theme.colors.glassSurface,
                            borderRadius: 6,
                        }}
                    >
                        <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                            Cannot cancel active
                        </Text>
                    </View>
                )}
                {isFailed && (
                    <Pressable
                        onPress={() => {
                            vibrate(10);
                            onRetry();
                        }}
                        style={{
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            backgroundColor: theme.colors.successFill,
                            borderRadius: 6,
                        }}
                    >
                        <Text style={{ color: theme.colors.green, fontSize: 11, fontWeight: '600' }}>Retry</Text>
                    </Pressable>
                )}
            </View>
        </View>
    );
};

export const CompressionJobsPanel: React.FC<CompressionJobsPanelProps> = React.memo(function CompressionJobsPanel({
    compressionState,
    onCancel,
    onRetry,
    onClearPending,
}) {
    const [expanded, setExpanded] = useState(false);

    const activeCount = compressionState.jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;
    const failedCount = compressionState.jobs.filter((j) => j.status === 'failed').length;
    const showBadge = activeCount > 0 || failedCount > 0;

    return (
        <View style={{ marginTop: 10 }}>
            {/* Header / Toggle */}
            <AnimatedScaleButton
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: theme.colors.glassSurfaceLow,
                    borderRadius: theme.borderRadius.sm,
                    padding: 12,
                }}
                onPress={() => {
                    vibrate(10);
                    setExpanded(!expanded);
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons
                        name="zip-box"
                        size={18}
                        color={showBadge ? theme.colors.primaryAction : theme.colors.textMuted}
                    />
                    <View>
                        <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' }}>
                            Compression Jobs
                        </Text>
                        {showBadge && (
                            <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 1 }}>
                                {activeCount > 0 ? `${activeCount} active` : ''}
                                {activeCount > 0 && failedCount > 0 ? ' | ' : ''}
                                {failedCount > 0 ? `${failedCount} failed` : ''}
                            </Text>
                        )}
                    </View>
                </View>
                <MaterialCommunityIcons
                    name={expanded ? 'chevron-down' : 'chevron-right'}
                    size={20}
                    color={theme.colors.textMuted}
                />
            </AnimatedScaleButton>

            {/* Expanded List */}
            {expanded && (
                <View style={{ marginTop: 8 }}>
                    {compressionState.jobs.length === 0 ? (
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontStyle: 'italic', padding: 8 }}>
                            No compression jobs at the moment.
                        </Text>
                    ) : (
                        <>
                            <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
                                {compressionState.jobs.map((job) => (
                                    <JobRow
                                        key={job.id}
                                        job={job}
                                        onCancel={() => onCancel(job.id)}
                                        onRetry={() => onRetry(job.id)}
                                    />
                                ))}
                            </ScrollView>

                            {/* Bulk actions */}
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                                <AnimatedScaleButton
                                    style={{
                                        flex: 1,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 4,
                                        backgroundColor: theme.colors.dangerFill,
                                        paddingVertical: 10,
                                        borderRadius: 8,
                                    }}
                                    onPress={() => {
                                        vibrate(15);
                                        onClearPending();
                                    }}
                                >
                                    <MaterialCommunityIcons
                                        name="trash-can-outline"
                                        size={14}
                                        color={theme.colors.danger}
                                    />
                                    <Text style={{ color: theme.colors.danger, fontSize: 12, fontWeight: '700' }}>
                                        Clear Pending
                                    </Text>
                                </AnimatedScaleButton>
                                {failedCount > 0 && (
                                    <AnimatedScaleButton
                                        style={{
                                            flex: 1,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 4,
                                            backgroundColor: theme.colors.successFill,
                                            paddingVertical: 10,
                                            borderRadius: 8,
                                        }}
                                        onPress={() => {
                                            vibrate(15);
                                            compressionState.jobs
                                                .filter((j) => j.status === 'failed')
                                                .forEach((j) => onRetry(j.id));
                                        }}
                                    >
                                        <MaterialCommunityIcons name="refresh" size={14} color={theme.colors.green} />
                                        <Text style={{ color: theme.colors.green, fontSize: 12, fontWeight: '700' }}>
                                            Retry All Failed
                                        </Text>
                                    </AnimatedScaleButton>
                                )}
                            </View>
                        </>
                    )}
                </View>
            )}
        </View>
    );
});
