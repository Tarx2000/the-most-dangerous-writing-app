import { StyleSheet, Platform, StatusBar } from 'react-native';
import { theme } from './theme';

export const commonStyles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: 'transparent' },

    startContainer: { flex: 1, backgroundColor: theme.colors.background },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 10, zIndex: 10 },
    iconButton: { padding: 8, paddingHorizontal: 12, backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.round, borderWidth: 1, borderColor: theme.colors.glassBorder, flexDirection: 'row', alignItems: 'center' },
    iconButtonText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.typography.weightBold },
    streakText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.typography.weightBold, marginLeft: 6 },

    heroContainer: { alignItems: 'center', marginTop: 10, marginBottom: 30 },
    heroTitle: {
        fontSize: 28,
        fontWeight: theme.typography.weightBold,
        color: theme.colors.textPrimary,
        letterSpacing: 0.5
    },
    heroTitleDanger: { color: theme.colors.danger },
    heroSubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 8,
        fontWeight: theme.typography.weightMedium
    },

    sectionTitle: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: theme.typography.weightBold, textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 20, marginBottom: 12, marginTop: 30 },

    cardsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
    card: { flex: 1, backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.md, padding: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'flex-start' },
    cardActive: { borderColor: theme.colors.textPrimary, backgroundColor: 'rgba(255,255,255,0.08)' },
    cardTitle: { color: theme.colors.textSecondary, fontSize: 16, fontWeight: theme.typography.weightBold, marginBottom: 4 },
    cardTitleActive: { color: theme.colors.textPrimary },
    cardDesc: { color: theme.colors.textMuted, fontSize: 12, fontWeight: theme.typography.weightMedium },

    bottomDock: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, backgroundColor: 'transparent' },
    dockedStartBtn: { shadowColor: theme.colors.danger, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { height: 4, width: 0 }, elevation: 10, backgroundColor: theme.colors.primaryAction, paddingVertical: 18, borderRadius: theme.borderRadius.round, alignItems: 'center' },
    dockedStartBtnText: { color: theme.colors.primaryActionText, fontSize: 18, fontWeight: theme.typography.weightBold, letterSpacing: 0.5 },

    carouselWrapper: {
        width: '100%',
        alignItems: 'center',
        marginVertical: 10,
    },
    carouselLabel: {
        display: 'none' // Hidden since we use sectionTitle now
    },
    carouselControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
    carouselItem: { alignItems: 'center', justifyContent: 'center' },
    carouselValueText: {
        color: theme.colors.textPrimary,
        fontSize: 48,
        fontWeight: theme.typography.weightLight,
        textAlign: 'center'
    },
    carouselArrowBtn: { padding: 15, zIndex: 10 },
    carouselArrowText: { color: theme.colors.textMuted, fontSize: 24, fontWeight: 'bold' },

    dotRow: { flexDirection: 'row', gap: 6, marginTop: 15 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textMuted },
    dotActive: { backgroundColor: theme.colors.textPrimary, width: 8, height: 8, borderRadius: 4 },



    versionBadge: { position: 'absolute', bottom: 20, right: 20 },
    versionText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: theme.typography.weightMedium },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
    versionModalContent: {
        backgroundColor: 'rgba(40, 35, 32, 0.95)',
        borderRadius: theme.borderRadius.lg,
        padding: 24,
        maxHeight: '80%',
        flexShrink: 1,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    versionModalTitle: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: theme.typography.weightBold, marginBottom: 20, textAlign: 'center' },
    versionHistoryBlock: { marginBottom: 20 },
    versionHistoryHeader: { color: theme.colors.danger, fontSize: 16, fontWeight: theme.typography.weightBold, marginBottom: 5 },
    versionHistoryItem: { color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22, marginLeft: 10, marginBottom: 3 },
    closeVersionBtn: { backgroundColor: theme.colors.glassHighlight, padding: 15, borderRadius: theme.borderRadius.round, alignItems: 'center', marginTop: 15 },
    closeVersionBtnText: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },

    settingsLabel: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: theme.typography.weightMedium, marginTop: 10, marginBottom: 8 },
    settingsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    previewContainer: {
        backgroundColor: theme.colors.glassBackground,
        padding: 15,
        borderRadius: theme.borderRadius.md,
        marginBottom: 15,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    previewText: { color: theme.colors.textPrimary, textAlign: 'center' },

    writingContainer: { flex: 1, padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    wordCount: { fontSize: 16, color: theme.colors.textSecondary, fontWeight: theme.typography.weightMedium },
    winText: { fontSize: 16, color: theme.colors.success, fontWeight: theme.typography.weightBold },
    lossText: { fontSize: 20, color: theme.colors.danger, fontWeight: theme.typography.weightBold, letterSpacing: 1 },

    inputWrapper: { flex: 1, borderRadius: theme.borderRadius.lg, overflow: 'hidden', backgroundColor: 'transparent', padding: 16 },
    textInput: { color: theme.colors.textPrimary, minHeight: 150 },

    finishedActionsContainer: { marginTop: 20, flexDirection: 'column', gap: 10 },
    saveActionBtn: { backgroundColor: theme.colors.primaryAction, padding: 18, borderRadius: theme.borderRadius.round, alignItems: 'center' },
    saveActionText: { color: theme.colors.primaryActionText, fontSize: 16, fontWeight: theme.typography.weightBold },
    menuActionBtn: { backgroundColor: theme.colors.glassBackground, padding: 18, borderRadius: theme.borderRadius.round, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.glassBorder },
    menuActionText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightMedium },

    progressBarContainer: { height: 4, backgroundColor: theme.colors.glassBackground, borderRadius: 2, marginBottom: 15, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: theme.colors.danger },

    libraryContainer: { flex: 1, padding: 20, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 10 : 20 },
    libraryTitle: { fontSize: 32, fontWeight: theme.typography.weightBold, color: theme.colors.textPrimary, marginBottom: 5 },
    librarySubtitle: { color: theme.colors.textSecondary, marginBottom: 20, fontSize: 16 },
    sortContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    sortLabel: { color: theme.colors.textSecondary, marginRight: 10, fontWeight: theme.typography.weightMedium },
    sortScroll: { flexGrow: 0 },
    sortBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.round,
        backgroundColor: theme.colors.glassBackground,
        marginRight: 8,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    sortBtnActive: { backgroundColor: theme.colors.primaryAction, borderColor: theme.colors.primaryAction },
    sortBtnText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: theme.typography.weightMedium },
    sortBtnTextActive: { color: theme.colors.primaryActionText, fontWeight: theme.typography.weightBold },
    emptyLibrary: { color: theme.colors.textMuted, textAlign: 'center', marginTop: 60, fontSize: 16 },
    groupContainer: { marginBottom: 30 },
    groupTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: theme.typography.weightBold, marginBottom: 15, borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder, paddingBottom: 8 },
    noteCard: {
        backgroundColor: theme.colors.glassBackground,
        padding: 16,
        borderRadius: theme.borderRadius.md,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    noteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    noteCardDate: { color: theme.colors.textSecondary, fontWeight: theme.typography.weightMedium },
    noteCardDuration: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },
    noteCardPreview: { color: theme.colors.textSecondary, lineHeight: 22 },
    backButton: { marginTop: 20, backgroundColor: theme.colors.glassBackground, padding: 18, borderRadius: theme.borderRadius.round, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.glassBorder },
    backButtonText: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold, fontSize: 16 },

    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: theme.typography.weightBold },
    closeModalButton: { backgroundColor: theme.colors.glassBackground, paddingVertical: 8, paddingHorizontal: 16, borderRadius: theme.borderRadius.round, borderWidth: 1, borderColor: theme.colors.glassBorder },
    closeModalText: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightMedium },
    modalScroll: { flex: 1 },
    modalBody: { color: theme.colors.textPrimary, fontSize: 18, lineHeight: 30 },

    deathOverlayLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(40, 35, 32, 0.95)', zIndex: 10000, justifyContent: 'center', alignItems: 'center', padding: 30 },
    deathContentBox: { alignItems: 'center', width: '100%' },
    deathGiant: { color: theme.colors.danger, fontSize: 44, fontWeight: theme.typography.weightBold, letterSpacing: 1, marginBottom: 15, textAlign: 'center' },
    deathSub: { color: theme.colors.textSecondary, fontSize: 18, textAlign: 'center', lineHeight: 28, marginBottom: 40, paddingHorizontal: 10 },

    deathBtnMaster: { backgroundColor: theme.colors.primaryAction, paddingVertical: 18, paddingHorizontal: 40, borderRadius: theme.borderRadius.round, width: '100%', alignItems: 'center', marginBottom: 15 },
    deathBtnMasterText: { color: theme.colors.primaryActionText, fontWeight: theme.typography.weightBold, fontSize: 16 },

    deathBtnSecondary: { paddingVertical: 15, width: '100%', alignItems: 'center', borderRadius: theme.borderRadius.round },
    deathBtnSecondaryText: { color: theme.colors.textMuted, fontWeight: theme.typography.weightMedium, fontSize: 16 },

    floatingActionRow: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        flexDirection: 'row',
        gap: 10,
        zIndex: 9999,
    },
    floatSaveBtn: {
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: theme.borderRadius.round,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 5 },
        elevation: 5
    },
    floatHomeBtn: {
        backgroundColor: theme.colors.glassBackground,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: theme.borderRadius.round,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    floatBtnText: {
        color: theme.colors.primaryActionText,
        fontWeight: theme.typography.weightBold,
    },

    // ==========================================
    // CIRCLES (PEOPLE JOURNAL) STYLES
    // ==========================================
    modeToggle: { flexDirection: 'row', backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.round, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.round, alignItems: 'center' },
    modeBtnActive: { backgroundColor: theme.colors.glassHighlight },
    modeBtnText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: theme.typography.weightMedium },
    modeBtnTextActive: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },

    personSelectorBtn: {
        width: '100%',
        backgroundColor: theme.colors.glassBackground,
        borderRadius: theme.borderRadius.lg,
        padding: 18,
        marginTop: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    personSelectorLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: theme.typography.weightMedium, marginBottom: 6 },
    personSelectorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    personSelectorName: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: theme.typography.weightBold },

    tabBar: { flexDirection: 'row', backgroundColor: theme.colors.glassBackground, borderRadius: theme.borderRadius.round, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.glassBorder },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.round, alignItems: 'center' },
    tabBtnActive: { backgroundColor: theme.colors.glassHighlight },
    tabBtnText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: theme.typography.weightMedium },
    tabBtnTextActive: { color: theme.colors.textPrimary, fontWeight: theme.typography.weightBold },

    circleSearchInput: {
        backgroundColor: theme.colors.glassBackground,
        color: theme.colors.textPrimary,
        fontSize: 16,
        padding: 16,
        borderRadius: theme.borderRadius.md,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },

    personCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.glassBackground,
        padding: 16,
        borderRadius: theme.borderRadius.md,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder
    },
    personCardName: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightBold },
    personCardMeta: { color: theme.colors.textMuted, fontSize: 13, marginTop: 4 },

    personAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.glassHighlight, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    personAvatarText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: theme.typography.weightBold },

    personSelectItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: theme.borderRadius.md, marginBottom: 4 },
    personSelectItemActive: { backgroundColor: theme.colors.glassHighlight },
    personSelectName: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightMedium },

    addPersonSuggestion: {
        backgroundColor: 'transparent',
        padding: 16,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        borderStyle: 'dashed'
    },
    addPersonSuggestionText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightMedium },

    addPersonFloatBtn: {
        backgroundColor: theme.colors.glassHighlight,
        padding: 16,
        borderRadius: theme.borderRadius.round,
        alignItems: 'center',
        marginTop: 15
    },
    addPersonFloatBtnText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightBold },
    addPersonInput: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        color: theme.colors.textPrimary,
        fontSize: 20,
        padding: 16,
        borderRadius: theme.borderRadius.md,
        width: '100%',
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        textAlign: 'center'
    },
});
