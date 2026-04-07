/**
 * NoteCard — Library entry card with AI processing animation.
 *
 * Displays a journal entry in the Library list.
 * When AI title is available, shows it as the primary preview (bold, larger).
 * Falls back to a truncated raw text preview if no AI title exists.
 *
 * Processing state is derived from the AI Queue (via `isProcessing` prop),
 * NOT from the deprecated `note.aiProcessing` flag.
 * When processing, shows a smooth pulsing glow border animation.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { SavedNote } from '@/types';
import { commonStyles } from '@/styles/commonStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { RichText } from '@/components/ui/RichText';

interface Props {
    note: SavedNote;
    onPress: (note: SavedNote) => void;
    personName?: string;
    isLocked?: boolean;
    /** Whether this note is actively being processed by the AI Queue (pulsing) */
    isProcessing?: boolean;
    /** Whether this note is waiting in the AI Queue */
    isQueued?: boolean;
    onLongPress?: () => void;
    isSelected?: boolean;
}

/**
 * NoteCard — Library entry card with live AI processing/queued indicators.
 *
 * Supports `isProcessing` (pulsing glow) and `isQueued` (subtle waiting dot) props.
 */
export const NoteCard: React.FC<Props> = React.memo(({ note, onPress, onLongPress, personName, isLocked, isProcessing, isQueued, isSelected }) => {
    const hasAi = !!note.aiTitle;

    /* ── Pulsing Glow Animation ─────────────────────────────────────── */
    const pulseAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isProcessing) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
                    Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
                ])
            );
            loop.start();
            return () => loop.stop();
        } else {
            pulseAnim.setValue(0);
        }
    }, [isProcessing, pulseAnim]);

    /** Animated border color: pulses between subtle and vibrant red */
    const animatedBorderColor = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255, 42, 42, 0.1)', 'rgba(255, 42, 42, 0.45)'],
    });

    /** Animated background glow */
    const animatedBgColor = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255, 42, 42, 0.0)', 'rgba(255, 42, 42, 0.04)'],
    });

    return (
        <TouchableOpacity
            style={[
                commonStyles.noteCard, 
                isSelected && { borderColor: theme.colors.primaryAction, backgroundColor: 'rgba(255,255,255,0.06)' }
            ]}
            onPress={() => !isLocked && onPress(note)}
            onLongPress={onLongPress}
            activeOpacity={isLocked ? 1 : 0.2}
            delayLongPress={400}
        >
            {/* Animated processing overlay — sits behind content */}
            {isProcessing && (
                <Animated.View
                    style={[
                        StyleSheet.absoluteFillObject,
                        styles.processingOverlay,
                        {
                            borderColor: animatedBorderColor,
                            backgroundColor: animatedBgColor,
                        },
                    ]}
                />
            )}

            <View style={commonStyles.noteCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Text style={commonStyles.noteCardDate}>{note.dateStr}</Text>
                    {isQueued && !isProcessing && (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textMuted, opacity: 0.5 }} />
                    )}
                </View>
                <Text style={commonStyles.noteCardDuration}>
                    {note.durationMin} Min {note.won && note.durationMin >= 3 && !note.isQuickNote ? '🔥' : (!note.won ? '💀' : '')}
                </Text>
            </View>

            {isLocked ? (
                <Text style={commonStyles.noteCardPreview} numberOfLines={3}>
                    •••• •••••••• ••••• ••• •••
                </Text>
            ) : isProcessing ? (
                <>
                    <View style={styles.processingRow}>
                        <MaterialCommunityIcons name="brain" size={13} color={theme.colors.primaryAction} />
                        <Text style={styles.processingText}>Processing...</Text>
                    </View>
                    <RichText style={commonStyles.noteCardPreview} numberOfLines={1} text={note.text} />
                </>
            ) : hasAi ? (
                <>
                    <RichText
                        style={{ color: '#FFF', fontSize: 16, fontWeight: '700', lineHeight: 22, marginBottom: 4 }}
                        numberOfLines={2}
                        text={note.aiTitle!}
                    />
                    <RichText style={commonStyles.noteCardPreview} numberOfLines={1} text={note.text} />
                </>
            ) : (
                <RichText style={commonStyles.noteCardPreview} numberOfLines={3} text={note.text} />
            )}

            {personName && (
                <Text style={{ ...commonStyles.noteCardPreview, marginTop: 8, color: '#aaa', fontStyle: 'italic' }}>
                    Linked to: {personName}
                </Text>
            )}
        </TouchableOpacity>
    );
});

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    /** Absolute-fill overlay for pulsing glow effect */
    processingOverlay: {
        borderRadius: 16,
        borderWidth: 1,
    },
    /** Row showing brain icon + "Processing..." text */
    processingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 4,
    },
    /** Processing label text */
    processingText: {
        color: theme.colors.primaryAction,
        fontSize: 12,
        fontWeight: '700',
    },
});
