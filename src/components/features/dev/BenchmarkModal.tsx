import React, { useState, useEffect } from 'react';
import { View, Text, Modal, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/styles/theme';
import { commonStyles } from '@/styles/commonStyles';
import { useNotes, useAiConfig } from '@/lib/hooks/useStorage';
import { generateTitle, generateSummary, checkGrammar } from '@/lib/aiService';

interface BenchmarkModalProps {
    visible: boolean;
    onClose: () => void;
}

const MODELS = ['kimi-k2.5:cloud', 'qwen3.5:397b-cloud', 'glm-5:cloud', 'minimax-m2.7:cloud', 'nemotron-3-super:cloud'];

interface BenchmarkResult {
    model: string;
    title: string | null;
    titleTimeMs: number;
    summary: string[] | null;
    summaryRaw: string | null;
    summaryTimeMs: number;
    grammarFixes: number;
    grammarRaw: string | null;
    grammarTimeMs: number;
    status: 'pending' | 'running' | 'done' | 'error';
    error?: string;
}

export type BenchmarkPhase = 'idle' | 'title' | 'summary' | 'grammar' | 'done';

export const BenchmarkModal: React.FC<BenchmarkModalProps> = ({ visible, onClose }) => {
    const { savedNotes } = useNotes();
    const { aiApiKey, aiBaseUrl, aiPrompts } = useAiConfig();
    const [running, setRunning] = useState(false);
    const [currentPhase, setCurrentPhase] = useState<BenchmarkPhase>('idle');
    const [results, setResults] = useState<Record<string, BenchmarkResult>>({});
    const [testInput, setTestInput] = useState('');

    useEffect(() => {
        if (visible) {
            const initial: Record<string, BenchmarkResult> = {};
            MODELS.forEach(m => {
                initial[m] = {
                    model: m,
                    title: null, titleTimeMs: 0,
                    summary: null, summaryRaw: null, summaryTimeMs: 0,
                    grammarFixes: 0, grammarRaw: null, grammarTimeMs: 0,
                    status: 'pending'
                };
            });
            setResults(initial);
            
            if (savedNotes.length > 0) {
                let max = savedNotes[0];
                for (const n of savedNotes) {
                    if (n.text.length > max.text.length) max = n;
                }
                setTestInput(max.text);
            } else {
                setTestInput("This is a placeholder journal entry to test the AI. I didn't have much to say, but I really enjoyed the coffee in the morning and I think the spelling is mostly fine but we will se.");
            }
        }
    }, [visible, savedNotes]);

    const runBenchmark = async () => {
        setRunning(true);

        const aiConfigBase = {
            apiKey: aiApiKey,
            baseUrl: aiBaseUrl,
            prompts: aiPrompts,
        };

        // Reset all models to running
        const initialStates: Record<string, BenchmarkResult> = {};
        MODELS.forEach(m => {
            initialStates[m] = {
                model: m,
                title: null, titleTimeMs: 0,
                summary: null, summaryRaw: null, summaryTimeMs: 0,
                grammarFixes: 0, grammarRaw: null, grammarTimeMs: 0,
                status: 'running'
            };
        });
        setResults(initialStates);

        // Phase 1: Titles
        setCurrentPhase('title');
        await Promise.allSettled(MODELS.map(async (model) => {
            try {
                const config = { ...aiConfigBase, model };
                const startTitle = Date.now();
                const title = await generateTitle(testInput, config, chunk => {
                    setResults(prev => ({ ...prev, [model]: { ...prev[model], title: chunk } }));
                });
                const titleTime = Date.now() - startTitle;
                setResults(prev => ({ ...prev, [model]: { ...prev[model], title, titleTimeMs: titleTime } }));
            } catch (err: any) {
                setResults(prev => ({ ...prev, [model]: { ...prev[model], status: 'error', error: err.message || 'Failed' } }));
            }
        }));

        // Phase 2: Summaries
        setCurrentPhase('summary');
        await Promise.allSettled(MODELS.map(async (model) => {
            try {
                // Skip if it already errored
                if (results[model]?.status === 'error') return;
                
                const config = { ...aiConfigBase, model };
                const startSum = Date.now();
                const summary = await generateSummary(testInput, config, chunk => {
                    setResults(prev => ({ ...prev, [model]: { ...prev[model], summaryRaw: chunk } }));
                });
                const sumTime = Date.now() - startSum;
                setResults(prev => ({ ...prev, [model]: { ...prev[model], summary, summaryTimeMs: sumTime } }));
            } catch (err: any) {
                setResults(prev => ({ ...prev, [model]: { ...prev[model], status: 'error', error: err.message || 'Failed' } }));
            }
        }));

        // Phase 3: Grammar
        setCurrentPhase('grammar');
        await Promise.allSettled(MODELS.map(async (model) => {
            try {
                if (results[model]?.status === 'error') return;

                const config = { ...aiConfigBase, model };
                const startGrammar = Date.now();
                const grammarRes = await checkGrammar(testInput, config, chunk => {
                    setResults(prev => ({ ...prev, [model]: { ...prev[model], grammarRaw: chunk } }));
                });
                const gramTime = Date.now() - startGrammar;
                setResults(prev => ({ 
                    ...prev, 
                    [model]: { ...prev[model], grammarFixes: grammarRes.length, grammarTimeMs: gramTime, status: 'done' } 
                }));
            } catch (err: any) {
                setResults(prev => ({ ...prev, [model]: { ...prev[model], status: 'error', error: err.message || 'Failed' } }));
            }
        }));

        setCurrentPhase('done');
        setRunning(false);
    };

    const { titleWinner, summaryWinner, grammarWinner } = React.useMemo(() => {
        let titleW = '', sumW = '', gramW = '';
        let tBest = Infinity, sBest = Infinity, gBest = Infinity;
        
        // Only evaluate winners if the phase is fully completed across all non-error models
        MODELS.forEach(m => {
            const r = results[m];
            if (!r || r.status === 'error') return;
            if (r.titleTimeMs > 0 && r.titleTimeMs < tBest) { tBest = r.titleTimeMs; titleW = m; }
            if (r.summaryTimeMs > 0 && r.summaryTimeMs < sBest) { sBest = r.summaryTimeMs; sumW = m; }
            if (r.grammarTimeMs > 0 && r.grammarTimeMs < gBest) { gBest = r.grammarTimeMs; gramW = m; }
        });
        
        return {
            titleWinner: currentPhase !== 'title' && currentPhase !== 'idle' ? titleW : null,
            summaryWinner: currentPhase === 'grammar' || currentPhase === 'done' ? sumW : null,
            grammarWinner: currentPhase === 'done' ? gramW : null
        };
    }, [results, currentPhase]);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Parallel AI Benchmark</Text>
                    <AnimatedScaleButton onPress={onClose} style={styles.closeBtn}>
                        <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
                    </AnimatedScaleButton>
                </View>
                
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.infoText}>
                        This tests title, summary, and grammar generation across ALL models IN PARALLEL using your longest journal entry ({testInput.length} chars).
                    </Text>

                    <AnimatedScaleButton 
                        style={[styles.runBtn, running && { opacity: 0.5 }]} 
                        onPress={runBenchmark}
                        disabled={running}
                    >
                        {running ? <ActivityIndicator color="#fff" /> : (
                            <Text style={styles.runBtnText}>Run Benchmark Race</Text>
                        )}
                    </AnimatedScaleButton>

                    {/* PHASE 1: TITLES */}
                    <View style={styles.phaseContainer}>
                        <View style={styles.phaseHeader}>
                            <Text style={styles.phaseTitle}>1. Title Generation</Text>
                            {currentPhase === 'title' && <ActivityIndicator color="#FFD700" size="small" />}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.phaseScroll}>
                            {MODELS.map(model => {
                                const res = results[model];
                                if (!res) return null;
                                const isWinner = model === titleWinner;
                                
                                return (
                                    <View key={model} style={[styles.phaseCard, isWinner && styles.winnerCard]}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.modelName} numberOfLines={1}>{model.split(':')[0]}</Text>
                                            {isWinner && <Text style={styles.winnerText}>🏆 {res.titleTimeMs}ms</Text>}
                                            {res.status === 'error' && <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.danger} />}
                                        </View>
                                        
                                        {res.status === 'error' ? (
                                            <Text style={styles.errorText}>Failed</Text>
                                        ) : (
                                            <Text style={styles.statValue}>
                                                {res.title || (currentPhase === 'title' ? '...' : '')}
                                            </Text>
                                        )}
                                        {!isWinner && res.titleTimeMs > 0 && <Text style={styles.timeValue}>{res.titleTimeMs}ms</Text>}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* PHASE 2: SUMMARIES */}
                    <View style={styles.phaseContainer}>
                        <View style={styles.phaseHeader}>
                            <Text style={styles.phaseTitle}>2. Summary Generation</Text>
                            {currentPhase === 'summary' && <ActivityIndicator color="#FFD700" size="small" />}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.phaseScroll}>
                            {MODELS.map(model => {
                                const res = results[model];
                                if (!res) return null;
                                const isWinner = model === summaryWinner;
                                
                                return (
                                    <View key={model} style={[styles.phaseCard, isWinner && styles.winnerCard]}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.modelName} numberOfLines={1}>{model.split(':')[0]}</Text>
                                            {isWinner && <Text style={styles.winnerText}>🏆 {res.summaryTimeMs}ms</Text>}
                                        </View>
                                        
                                        <ScrollView style={{ maxHeight: 120 }}>
                                            {res.summary ? (
                                                res.summary.map((b, i) => <Text key={i} style={styles.bulletText}>• {b}</Text>)
                                            ) : res.summaryRaw ? (
                                                <Text style={[styles.statValue, { fontStyle: 'italic', color: theme.colors.textSecondary }]}>{res.summaryRaw}</Text>
                                            ) : <Text style={styles.statValue}>{currentPhase === 'summary' ? '...' : ''}</Text>}
                                        </ScrollView>
                                        {!isWinner && res.summaryTimeMs > 0 && <Text style={styles.timeValue}>{res.summaryTimeMs}ms</Text>}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* PHASE 3: GRAMMAR */}
                    <View style={styles.phaseContainer}>
                        <View style={styles.phaseHeader}>
                            <Text style={styles.phaseTitle}>3. Grammar Evaluation</Text>
                            {currentPhase === 'grammar' && <ActivityIndicator color="#FFD700" size="small" />}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.phaseScroll}>
                            {MODELS.map(model => {
                                const res = results[model];
                                if (!res) return null;
                                const isWinner = model === grammarWinner;
                                
                                return (
                                    <View key={model} style={[styles.phaseCard, isWinner && styles.winnerCard]}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.modelName} numberOfLines={1}>{model.split(':')[0]}</Text>
                                            {isWinner && <Text style={styles.winnerText}>🏆 {res.grammarTimeMs}ms</Text>}
                                        </View>
                                        
                                        <ScrollView style={{ maxHeight: 120 }}>
                                            {res.grammarTimeMs > 0 ? (
                                                <Text style={[styles.statValue, { fontWeight: 'bold', color: theme.colors.success }]}>{res.grammarFixes} suggestions found.</Text>
                                            ) : res.grammarRaw ? (
                                                <Text style={[styles.statValue, { fontSize: 10, fontFamily: 'monospace', opacity: 0.5 }]} numberOfLines={5}>{res.grammarRaw}</Text>
                                            ) : <Text style={styles.statValue}>{currentPhase === 'grammar' ? '...' : ''}</Text>}
                                        </ScrollView>
                                        {!isWinner && res.grammarTimeMs > 0 && <Text style={styles.timeValue}>{res.grammarTimeMs}ms</Text>}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>

                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        paddingTop: 40,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeBtn: {
        width: 40, height: 40,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 60,
    },
    infoText: {
        color: theme.colors.textMuted,
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    runBtn: {
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 30,
    },
    runBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    phaseContainer: {
        marginBottom: 24,
    },
    phaseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    phaseTitle: {
        color: '#FFD700',
        fontSize: 16,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    phaseScroll: {
        paddingRight: 24,
        gap: 16,
    },
    phaseCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        width: 260,
        minHeight: 120,
        justifyContent: 'space-between',
    },
    winnerCard: {
        borderColor: 'rgba(255,215,0,0.4)',
        backgroundColor: 'rgba(255,215,0,0.05)',
        borderWidth: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        paddingBottom: 8,
    },
    modelName: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontWeight: 'bold',
        flex: 1,
    },
    winnerText: {
        color: '#FFD700',
        fontSize: 12,
        fontWeight: 'bold',
    },
    statValue: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        opacity: 0.9,
    },
    timeValue: {
        color: theme.colors.textMuted,
        fontSize: 12,
        marginTop: 8,
        textAlign: 'right',
    },
    bulletText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        marginBottom: 6,
        lineHeight: 18,
    },
    errorText: {
        color: theme.colors.danger,
        fontSize: 13,
        fontWeight: 'bold',
    }
});
