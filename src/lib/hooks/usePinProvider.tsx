import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { storage } from '@/lib/storage';
import { CONFIG } from '@/config';

/**
 * Modes for the PIN pad:
 * - 'verify': The user has a PIN, enter it to unlock.
 * - 'setup_1': No PIN exists, enter a new 4-digit PIN.
 * - 'setup_2': Confirm the new 4-digit PIN.
 */
export type PinMode = 'verify' | 'setup_1' | 'setup_2';

interface PinContextType {
    /** 
     * Request a PIN from the user. 
     * Pauses execution until the user enters the correct PIN or cancels.
     */
    requestPin: (promptMessage?: string) => Promise<boolean>;
    
    // State exposed exclusively for PinPadModal
    isVisible: boolean;
    mode: PinMode;
    promptText: string;
    
    // Callbacks for PinPadModal
    onSuccess: () => void;
    onCancel: () => void;
}

const PinContext = createContext<PinContextType | null>(null);

export const PinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [mode, setMode] = useState<PinMode>('verify');
    const [promptText, setPromptText] = useState('Enter PIN');
    
    // Store the resolver function so we can manually resolve the promise from the modal
    const [resolver, setResolver] = useState<((result: boolean) => void) | null>(null);

    const requestPin = useCallback(async (promptMessage?: string): Promise<boolean> => {
        // First, check if a PIN is actually set up in AsyncStorage.
        try {
            const existingPin = await storage.getItem(CONFIG.SECURITY_PIN_KEY);
            if (!existingPin) {
                // Force Setup Mode
                setMode('setup_1');
                setPromptText('Create a 4-Digit PIN');
            } else {
                setMode('verify');
                setPromptText(promptMessage || 'Enter PIN');
            }
        } catch (e) {
            console.warn('[PinProvider] Error reading PIN from storage:', e);
            setMode('verify');
        }

        setIsVisible(true);

        return new Promise<boolean>((resolve) => {
            setResolver(() => resolve);
        });
    }, []);

    const onSuccess = useCallback(() => {
        setIsVisible(false);
        if (resolver) resolver(true);
        setResolver(null);
    }, [resolver]);

    const onCancel = useCallback(() => {
        setIsVisible(false);
        if (resolver) resolver(false);
        setResolver(null);
    }, [resolver]);

    const value = useMemo(() => ({
        requestPin,
        isVisible,
        mode,
        promptText,
        onSuccess,
        onCancel
    }), [requestPin, isVisible, mode, promptText, onSuccess, onCancel]);

    return (
        <PinContext.Provider value={value}>
            {children}
        </PinContext.Provider>
    );
};

export const usePinContext = () => {
    const context = useContext(PinContext);
    if (!context) {
        throw new Error('usePinContext must be used within a PinProvider');
    }
    return context;
};
