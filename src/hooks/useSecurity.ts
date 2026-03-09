import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

export function useSecurity() {
    const [isNotesUnlocked, setIsNotesUnlocked] = useState<boolean>(false);
    const [customPin, setCustomPin] = useState<string | null>(null);
    const [useBiometrics, setUseBiometrics] = useState<boolean>(true);

    const [showPinSetupModal, setShowPinSetupModal] = useState<boolean>(false);
    const [showPinEnterModal, setShowPinEnterModal] = useState<boolean>(false);
    const [tempPinInput, setTempPinInput] = useState<string>('');
    const [pinSetupStep, setPinSetupStep] = useState<1 | 2>(1);
    const [firstPinEntry, setFirstPinEntry] = useState<string>('');
    const [pendingPinChange, setPendingPinChange] = useState<boolean>(false);

    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const loadSecurityData = useCallback(async () => {
        try {
            const storedPin = await AsyncStorage.getItem('USER_CUSTOM_PIN');
            if (storedPin) setCustomPin(storedPin);

            const storedUseBio = await AsyncStorage.getItem('USE_BIOMETRICS');
            if (storedUseBio !== null) setUseBiometrics(JSON.parse(storedUseBio));
        } catch (error) {
            console.error('Failed to load security settings', error);
        }
    }, []);

    const resetLockTimeout = useCallback(() => {
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = setTimeout(() => {
            setIsNotesUnlocked(false);
        }, 600000); // 10 minutes
    }, []);

    const lockInstantly = useCallback(() => {
        setIsNotesUnlocked(false);
        setShowPinEnterModal(false);
        setShowPinSetupModal(false);
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    }, []);

    const triggerPinFallback = useCallback(() => {
        if (!customPin) {
            setPinSetupStep(1);
            setTempPinInput('');
            setFirstPinEntry('');
            setShowPinSetupModal(true);
        } else {
            setTempPinInput('');
            setShowPinEnterModal(true);
        }
    }, [customPin]);

    const handleSuccessfulUnlock = useCallback(() => {
        setShowPinEnterModal(false);
        setIsNotesUnlocked(true);
        resetLockTimeout();
    }, [resetLockTimeout]);

    const unlockNotes = useCallback(async () => {
        if (!useBiometrics) {
            triggerPinFallback();
            return;
        }

        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled || Platform.OS === 'web') {
                triggerPinFallback();
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock your notes',
                fallbackLabel: 'Use PIN',
            });

            if (result.success) {
                handleSuccessfulUnlock();
            } else {
                triggerPinFallback();
            }
        } catch (e) {
            console.warn('Authentication err', e);
            triggerPinFallback();
        }
    }, [useBiometrics, triggerPinFallback, handleSuccessfulUnlock]);

    const handlePinSetupSubmit = useCallback(async () => {
        if (tempPinInput.length !== 4) return;

        if (pinSetupStep === 1) {
            setFirstPinEntry(tempPinInput);
            setTempPinInput('');
            setPinSetupStep(2);
        } else {
            if (tempPinInput === firstPinEntry) {
                setCustomPin(tempPinInput);
                await AsyncStorage.setItem('USER_CUSTOM_PIN', tempPinInput);
                setShowPinSetupModal(false);
                setTempPinInput('');
                handleSuccessfulUnlock();
            } else {
                // Here you would optimally show a toast/alert or just reset
                setTempPinInput('');
                setPinSetupStep(1);
            }
        }
    }, [tempPinInput, pinSetupStep, firstPinEntry, handleSuccessfulUnlock]);

    const handlePinEnterSubmit = useCallback(() => {
        if (tempPinInput === customPin) {
            if (pendingPinChange) {
                setPendingPinChange(false);
                setShowPinEnterModal(false);
                setTempPinInput('');
                setPinSetupStep(1);
                setFirstPinEntry('');
                setShowPinSetupModal(true);
            } else {
                handleSuccessfulUnlock();
            }
        } else {
            setTempPinInput('');
        }
    }, [tempPinInput, customPin, pendingPinChange, handleSuccessfulUnlock]);

    const changePinWithAuth = useCallback(async (onCloseSettings: () => void) => {
        onCloseSettings();

        if (!customPin) {
            setPinSetupStep(1);
            setTempPinInput('');
            setFirstPinEntry('');
            setShowPinSetupModal(true);
            return;
        }

        if (useBiometrics && Platform.OS !== 'web') {
            try {
                const hasHardware = await LocalAuthentication.hasHardwareAsync();
                const isEnrolled = await LocalAuthentication.isEnrolledAsync();
                if (hasHardware && isEnrolled) {
                    const result = await LocalAuthentication.authenticateAsync({
                        promptMessage: 'Verify identity to change PIN',
                    });
                    if (result.success) {
                        setPinSetupStep(1);
                        setTempPinInput('');
                        setFirstPinEntry('');
                        setShowPinSetupModal(true);
                        return;
                    }
                }
            } catch (e) {
                console.warn('Bio auth for PIN change failed', e);
            }
        }

        setPendingPinChange(true);
        setTempPinInput('');
        setShowPinEnterModal(true);
    }, [customPin, useBiometrics]);

    const toggleBiometrics = useCallback(async (onCloseSettings: () => void) => {
        if (!useBiometrics && !customPin) {
            // Must setup PIN first
            onCloseSettings();
            setPinSetupStep(1);
            setTempPinInput('');
            setFirstPinEntry('');
            setShowPinSetupModal(true);
            return false;
        }

        const newVal = !useBiometrics;
        setUseBiometrics(newVal);
        await AsyncStorage.setItem('USE_BIOMETRICS', JSON.stringify(newVal));
        return true;
    }, [useBiometrics, customPin]);

    useEffect(() => {
        loadSecurityData();
        return () => {
            if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        }
    }, [loadSecurityData]);

    return {
        isNotesUnlocked,
        customPin,
        useBiometrics,
        showPinSetupModal,
        showPinEnterModal,
        tempPinInput,
        pinSetupStep,
        setTempPinInput,
        setShowPinSetupModal,
        setShowPinEnterModal,
        unlockNotes,
        lockInstantly,
        handlePinSetupSubmit,
        handlePinEnterSubmit,
        changePinWithAuth,
        toggleBiometrics
    };
}
