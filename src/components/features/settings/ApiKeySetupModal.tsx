/**
 * ApiKeySetupModal — First-launch and settings AI credential configuration.
 *
 * Shows when no API key is configured. Validates the key by pinging the
 * Ollama server before accepting. A "Skip" button allows proceeding
 * without AI features.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { theme } from '@/styles/theme';
import { pingServer } from '@/lib/aiService';
import { AI_AVAILABLE_MODELS, DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/config/ai';

type ApiKeySetupModalProps = {
    visible: boolean;
    initialKey?: string;
    initialBaseUrl?: string;
    initialModel?: string;
    onSave: (key: string, baseUrl: string, model: string) => void;
    onSkip: () => void;
};

export const ApiKeySetupModal: React.FC<ApiKeySetupModalProps> = ({
    visible,
    initialKey = '',
    initialBaseUrl = DEFAULT_OLLAMA_BASE_URL,
    initialModel = DEFAULT_OLLAMA_MODEL,
    onSave,
    onSkip,
}) => {
    const [apiKey, setApiKey] = useState(initialKey);
    const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
    const [model, setModel] = useState(initialModel);
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleValidateAndSave = useCallback(async () => {
        if (!apiKey.trim()) {
            setError('Please enter an API key.');
            return;
        }

        setIsValidating(true);
        setError(null);

        try {
            const result = await pingServer({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim() });
            if (result.online) {
                onSave(apiKey.trim(), baseUrl.trim(), model);
                setError(null);
            } else {
                setError(result.error || 'Server unreachable. Check your key and URL.');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Validation failed');
        } finally {
            setIsValidating(false);
        }
    }, [apiKey, baseUrl, model, onSave]);

    if (!visible) return null;

    return (
        <View style={styles.overlay}>
            <View style={styles.card}>
                <MaterialCommunityIcons name="brain" size={32} color={theme.colors.primaryAction} style={styles.icon} />
                <Text style={styles.title}>Configure AI</Text>
                <Text style={styles.subtitle}>
                    Enter your Ollama Cloud API key to enable AI-powered titles, summaries, and grammar checking.
                </Text>

                {/* API Key Input */}
                <Text style={styles.label}>API Key</Text>
                <TextInput
                    style={styles.input}
                    value={apiKey}
                    onChangeText={(text) => {
                        setApiKey(text);
                        setError(null);
                    }}
                    placeholder="Paste your API key"
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                {/* Base URL Input */}
                <Text style={styles.label}>Base URL</Text>
                <TextInput
                    style={styles.input}
                    value={baseUrl}
                    onChangeText={(text) => {
                        setBaseUrl(text);
                        setError(null);
                    }}
                    placeholder="https://ollama.com/v1"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                {/* Model Picker (simplified horizontal list) */}
                <Text style={styles.label}>Model</Text>
                <View style={styles.modelRow}>
                    {AI_AVAILABLE_MODELS.map((m) => (
                        <AnimatedScaleButton
                            key={m}
                            style={[
                                styles.modelChip,
                                model === m && styles.modelChipActive,
                            ]}
                            onPress={() => setModel(m)}
                        >
                            <Text
                                style={[
                                    styles.modelChipText,
                                    model === m && styles.modelChipTextActive,
                                ]}
                            >
                                {m}
                            </Text>
                        </AnimatedScaleButton>
                    ))}
                </View>

                {/* Error Message */}
                {error && (
                    <View style={styles.errorBox}>
                        <MaterialCommunityIcons name="alert-circle" size={14} color={theme.colors.danger} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Actions */}
                <AnimatedScaleButton
                    style={styles.saveButton}
                    onPress={handleValidateAndSave}
                    disabled={isValidating}
                >
                    {isValidating ? (
                        <ActivityIndicator size="small" color={theme.colors.background} />
                    ) : (
                        <Text style={styles.saveButtonText}>Validate & Save</Text>
                    )}
                </AnimatedScaleButton>

                <AnimatedScaleButton style={styles.skipButton} onPress={onSkip}>
                    <Text style={styles.skipButtonText}>Skip for now</Text>
                </AnimatedScaleButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.overlayStrong,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: theme.colors.surfaceDark,
        borderRadius: theme.borderRadius.md,
        padding: 28,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    icon: {
        alignSelf: 'center',
        marginBottom: 12,
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 6,
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
        marginTop: 12,
    },
    input: {
        backgroundColor: theme.colors.glassSurface,
        color: theme.colors.textPrimary,
        fontSize: 14,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
        fontFamily: 'monospace',
    },
    modelRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    modelChip: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.glassSurfaceSubtle,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    modelChipActive: {
        backgroundColor: theme.colors.primaryAction,
        borderColor: theme.colors.primaryAction,
    },
    modelChipText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontWeight: '500',
    },
    modelChipTextActive: {
        color: theme.colors.background,
        fontWeight: '700',
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: theme.colors.dangerSubtle,
        borderWidth: 1,
        borderColor: theme.colors.dangerBorder,
        borderRadius: 8,
        padding: 10,
        marginTop: 16,
    },
    errorText: {
        color: theme.colors.danger,
        fontSize: 12,
        flex: 1,
    },
    saveButton: {
        backgroundColor: theme.colors.primaryAction,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 20,
    },
    saveButtonText: {
        color: theme.colors.background,
        fontSize: 15,
        fontWeight: '700',
    },
    skipButton: {
        marginTop: 12,
        alignItems: 'center',
        paddingVertical: 8,
    },
    skipButtonText: {
        color: theme.colors.textMuted,
        fontSize: 13,
        fontWeight: '500',
    },
});