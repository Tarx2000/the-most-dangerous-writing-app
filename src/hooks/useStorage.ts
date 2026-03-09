import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedNote, Person } from '../types';

export function useStorage() {
    const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
    const [persons, setPersons] = useState<Person[]>([]);
    const [currentStreak, setCurrentStreak] = useState<number>(0);
    const [lastWinDate, setLastWinDate] = useState<string>('');

    const [fontIndex, setFontIndex] = useState(0);
    const [sizeIndex, setSizeIndex] = useState(1);
    const [useBiometrics, setUseBiometrics] = useState<boolean>(true);

    const loadAllData = useCallback(async () => {
        try {
            const keys = [
                'SAVED_NOTES',
                'SAVED_PERSONS',
                'USER_FONT_IDX',
                'USER_SIZE_IDX',
                'USE_BIOMETRICS',
                'CURRENT_STREAK',
                'LAST_WIN_DATE'
            ];
            const results = await AsyncStorage.multiGet(keys);
            const data: Record<string, string | null> = Object.fromEntries(results);

            if (data['SAVED_NOTES']) setSavedNotes(JSON.parse(data['SAVED_NOTES']));
            if (data['SAVED_PERSONS']) setPersons(JSON.parse(data['SAVED_PERSONS']));
            if (data['USER_FONT_IDX'] !== null) setFontIndex(parseInt(data['USER_FONT_IDX'], 10));
            if (data['USER_SIZE_IDX'] !== null) setSizeIndex(parseInt(data['USER_SIZE_IDX'], 10));
            if (data['USE_BIOMETRICS'] !== null) setUseBiometrics(JSON.parse(data['USE_BIOMETRICS']));
            if (data['CURRENT_STREAK'] !== null) setCurrentStreak(parseInt(data['CURRENT_STREAK'], 10));
            if (data['LAST_WIN_DATE']) setLastWinDate(data['LAST_WIN_DATE']);

        } catch (error) {
            console.error('Failed to load storage data', error);
        }
    }, []);

    const savePreferences = async (fIdx: number, sIdx: number) => {
        setFontIndex(fIdx);
        setSizeIndex(sIdx);
        await AsyncStorage.setItem('USER_FONT_IDX', fIdx.toString());
        await AsyncStorage.setItem('USER_SIZE_IDX', sIdx.toString());
    };

    const updateBiometricsPref = async (val: boolean) => {
        setUseBiometrics(val);
        await AsyncStorage.setItem('USE_BIOMETRICS', JSON.stringify(val));
    };

    const saveNote = async (note: SavedNote) => {
        let updatedStreak = currentStreak;
        let newLastWinDate = lastWinDate;

        // Process streak logic inline
        if (note.won) {
            const todayStr = new Date().toLocaleDateString();
            if (lastWinDate !== todayStr) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toLocaleDateString();

                if (lastWinDate === yesterdayStr) {
                    updatedStreak += 1;
                } else {
                    updatedStreak = 1;
                }

                newLastWinDate = todayStr;
                setCurrentStreak(updatedStreak);
                setLastWinDate(newLastWinDate);
                await AsyncStorage.setItem('CURRENT_STREAK', updatedStreak.toString());
                await AsyncStorage.setItem('LAST_WIN_DATE', newLastWinDate);
            }
        }

        const updated = [note, ...savedNotes];
        setSavedNotes(updated);
        await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updated));
    };

    const deleteNote = async (id: string) => {
        const updated = savedNotes.filter(n => n.id !== id);
        setSavedNotes(updated);
        await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updated));
    };

    const addPerson = async (name: string) => {
        if (name.trim().length === 0) return;
        const newPerson: Person = {
            id: Date.now().toString(),
            name: name.trim(),
            createdAt: Date.now(),
        };
        const updated = [newPerson, ...persons];
        setPersons(updated);
        await AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updated));
    };

    const deletePerson = async (id: string) => {
        const updatedPersons = persons.filter(p => p.id !== id);
        setPersons(updatedPersons);

        // Unlink notes attached to this person
        const updatedNotes = savedNotes.map(n => n.personId === id ? { ...n, personId: undefined } : n);
        setSavedNotes(updatedNotes);

        await AsyncStorage.setItem('SAVED_PERSONS', JSON.stringify(updatedPersons));
        await AsyncStorage.setItem('SAVED_NOTES', JSON.stringify(updatedNotes));
    };

    return {
        savedNotes,
        persons,
        currentStreak,
        lastWinDate,
        fontIndex,
        sizeIndex,
        useBiometrics,
        loadAllData,
        savePreferences,
        updateBiometricsPref,
        saveNote,
        deleteNote,
        addPerson,
        deletePerson,
    };
}
