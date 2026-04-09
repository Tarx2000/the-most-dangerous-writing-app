import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Vibration,
    Dimensions,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { commonStyles } from '@/styles/commonStyles';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { RichText } from '@/components/ui/RichText';
import type { SavedNote, AiJobCategory } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
    note: SavedNote | null;
    visible: boolean;
    onClose: () => void;
    onDelete: (id: string) => void;
    isNoteActive: (id: string) => boolean;
    onRegenerateAi: (note: SavedNote, category: AiJobCategory) => void;
}

export const NoteViewerModal: React.FC<Props> = ({
    note,
    visible,
    onClose,
    onDelete,
    isNoteActive,
    onRegenerateAi,
}) => {
    /* ── Local confirmation state ── */
    const [confirmDelete, setConfirmDelete] = useState(false);

    /* ── Swipe-to-dismiss gesture ── */
    const panY = useSharedValue(0);
    const notePanGesture = Gesture.Pan()
        .activeOffsetY([-20, 20])
        .onUpdate((e) => {
            if (e.translationY > 0) {
                panY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (e.translationY > 150 || e.velocityY > 1000) {
                runOnJS(onClose)();
            } else {
                panY.value = withSpring(0, { damping: 20, stiffness: 200 });
            }
        });

    /** Overscroll logic: allow pulling down the scrollview itself to close */
    const handleScroll = useCallback((e: any) => {
        if (e.nativeEvent.contentOffset.y < -50) {
            onClose();
        }
    }, [onClose]);

    const animatedCardStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: panY.value }],
    }));

    /* ── Reset animation when note changes ── */
    React.useEffect(() => {
        if (visible) {
            panY.value = SCREEN_HEIGHT;
            panY.value = withSpring(0, { damping: 30, stiffness: 220, mass: 0.8 });
        }
    }, [visible, note, panY]);

    const handleRegenerateAi = useCallback(() => {
        if (!note) return;
        Vibration.vibrate(30);
        const category: AiJobCategory = (note as any).isAlignmentReflection
            ? 'checkin'
            : note.personId
            ? 'circle'
            : 'journal';
        onRegenerateAi(note, category);
    }, [note, onRegenerateAi]);

    /* ── Render ── */
    if (!note) return null;

    return (
        <>
            <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
                <View style={styles.cardPopupBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
                    <Animated.View style={[styles.cardPopupContainer, animatedCardStyle]}>
                        <View style={styles.cardPopupTint} />

                        {/* Swipeable Header Zone */}
                        <GestureHandlerRootView>
                            <GestureDetector gesture={notePanGesture}>
                                <Animated.View>
                                    <View style={styles.cardPopupHandle} />
                                    <View style={styles.cardPopupHeader}>
                                        <View style={{ flex: 1 }}>
                                            {note.aiTitle ? (
                                                <RichText style={styles.premiumNoteAiTitle} numberOfLines={2} text={note.aiTitle} />
                                            ) : null}
                                            <Text style={styles.premiumNoteDate}>{note.dateStr}</Text>
                                            <Text style={styles.premiumNoteMeta}>
                                                {note.text.split(/\s+/).filter(Boolean).length} words • {note.durationMin > 0 ? `${note.durationMin} min` : 'Quick Note'}
                                            </Text>
                                        </View>
                                        <AnimatedScaleButton style={styles.premiumNoteCloseBtn} onPress={onClose}>
                                            <MaterialCommunityIcons name="close" size={22} color="#FFF" />
                                        </AnimatedScaleButton>
                                    </View>
                                </Animated.View>
                            </GestureDetector>
                        </GestureHandlerRootView>

                        {/* Body */}
                        <ScrollView 
                            style={styles.cardPopupScroll} 
                            showsVerticalScrollIndicator={false}
                            bounces={true}
                            overScrollMode="always"
                            onScroll={handleScroll}
                            scrollEventThrottle={16}
                        >
                            {note.aiSummary && note.aiSummary.length > 0 && (
                                <View style={styles.aiSummaryCard}>
                                    <View style={styles.aiSummaryHeader}>
                                        <MaterialCommunityIcons name="brain" size={16} color={theme.colors.primaryAction} />
                                        <Text style={styles.aiSummaryHeaderText}>AI Summary</Text>
                                    </View>
                                    {note.aiSummary.map((bullet, idx) => (
                                        <View key={idx} style={styles.aiSummaryBulletRow}>
                                            <Text style={styles.aiSummaryBulletDot}>•</Text>
                                            <RichText style={styles.aiSummaryBulletText} text={bullet} />
                                        </View>
                                    ))}
                                    {note.aiModelUsed && (
                                        <Text style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                                            {note.aiModelUsed}
                                        </Text>
                                    )}
                                </View>
                            )}

                            {!note.aiTitle && (!note.aiSummary || note.aiSummary.length === 0) && !isNoteActive(note.id) && (
                                <AnimatedScaleButton style={styles.regenerateBtn} onPress={handleRegenerateAi}>
                                    <MaterialCommunityIcons name="creation" size={14} color={theme.colors.primaryAction} />
                                    <Text style={styles.regenerateBtnText}>Generate AI Summary</Text>
                                </AnimatedScaleButton>
                            )}

                            {isNoteActive(note.id) && (
                                <View style={[styles.regenerateBtn, { borderColor: 'rgba(255, 42, 42, 0.2)' }]}>
                                    <ActivityIndicator size="small" color={theme.colors.primaryAction} />
                                    <Text style={styles.regenerateBtnText}>Processing...</Text>
                                </View>
                            )}

                            <Text style={styles.premiumNoteBody} selectable={true}>{note.text}</Text>
                            <View style={{ height: 100 }} />
                        </ScrollView>

                        {/* Footer */}
                        <View style={styles.premiumNoteFooter}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <AnimatedScaleButton style={styles.premiumNoteDeleteBtn} onPress={() => setConfirmDelete(true)}>
                                    <MaterialCommunityIcons name="delete-outline" size={18} color={theme.colors.danger} />
                                    <Text style={styles.premiumNoteDeleteText}>Delete Entry</Text>
                                </AnimatedScaleButton>
                                {(note.aiTitle || (note.aiSummary && note.aiSummary.length > 0)) && (
                                    <AnimatedScaleButton
                                        style={styles.regenerateSmallBtn}
                                        onPress={handleRegenerateAi}
                                        disabled={isNoteActive(note.id)}
                                    >
                                        {isNoteActive(note.id) ? (
                                            <ActivityIndicator size="small" color={theme.colors.textMuted} />
                                        ) : (
                                            <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.textMuted} />
                                        )}
                                    </AnimatedScaleButton>
                                )}
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            {/* Delete Confirmation Overlay */}
            <Modal visible={confirmDelete} transparent animationType="fade">
                <View style={commonStyles.modalOverlay}>
                    <View style={commonStyles.versionModalContent}>
                        <Text style={commonStyles.versionModalTitle}>Delete Entry?</Text>
                        <Text style={{ textAlign: 'center', marginBottom: 20, color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 22 }}>
                            Are you sure you want to permanently delete this session? This cannot be undone.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <AnimatedScaleButton style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.glassBackground, marginTop: 0 }]} onPress={() => setConfirmDelete(false)}>
                                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textPrimary} />
                                <Text style={[{ color: theme.colors.textPrimary, fontWeight: 'bold', fontSize: 15 }]}>Cancel</Text>
                            </AnimatedScaleButton>
                            <AnimatedScaleButton style={[commonStyles.closeVersionBtn, { flex: 1, backgroundColor: theme.colors.danger, marginTop: 0 }]} onPress={() => {
                                onDelete(note.id);
                                setConfirmDelete(false);
                            }}>
                                <MaterialCommunityIcons name="delete-outline" size={18} color="#FFF" />
                                <Text style={[{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }]}>Delete</Text>
                            </AnimatedScaleButton>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};

/* ── STYLES ── */
const styles = StyleSheet.create({
    cardPopupBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    cardPopupContainer: {
        width: '100%',
        height: SCREEN_HEIGHT * 0.88,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    },
    cardPopupTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#111',
    },
    cardPopupHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    cardPopupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    premiumNoteDate: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 4,
    },
    premiumNoteAiTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 4,
        lineHeight: 28,
    },
    premiumNoteMeta: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    premiumNoteCloseBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardPopupScroll: {
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    premiumNoteBody: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 17,
        lineHeight: 28,
        paddingBottom: 40,
    },
    aiSummaryCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    aiSummaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    aiSummaryHeaderText: {
        color: theme.colors.primaryAction,
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    aiSummaryBulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    aiSummaryBulletDot: {
        color: theme.colors.primaryAction,
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8,
        marginTop: 2,
    },
    aiSummaryBulletText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 15,
        lineHeight: 22,
        flex: 1,
    },
    regenerateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255, 42, 42, 0.1)',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.3)',
    },
    regenerateBtnText: {
        color: theme.colors.primaryAction,
        fontSize: 13,
        fontWeight: '700',
    },
    premiumNoteFooter: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        backgroundColor: '#111',
    },
    premiumNoteDeleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 42, 42, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 42, 42, 0.2)',
    },
    premiumNoteDeleteText: {
        color: theme.colors.danger,
        fontWeight: 'bold',
        fontSize: 14,
    },
    regenerateSmallBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
