jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        setItem: jest.fn(),
        getItem: jest.fn(),
        removeItem: jest.fn(),
        multiGet: jest.fn(),
        multiSet: jest.fn(),
        multiRemove: jest.fn(),
        getAllKeys: jest.fn(),
        clear: jest.fn(),
    },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '@/lib/storage';

describe('storage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('setItem delegates to AsyncStorage.setItem', async () => {
        (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
        await storage.setItem('key', 'value');
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('key', 'value');
    });

    it('getItem delegates to AsyncStorage.getItem', async () => {
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue('value');
        const result = await storage.getItem('key');
        expect(AsyncStorage.getItem).toHaveBeenCalledWith('key');
        expect(result).toBe('value');
    });

    it('removeItem delegates to AsyncStorage.removeItem', async () => {
        (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
        await storage.removeItem('key');
        expect(AsyncStorage.removeItem).toHaveBeenCalledWith('key');
    });

    it('multiGet delegates to AsyncStorage.multiGet and returns cast type', async () => {
        (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
            ['k1', 'v1'],
            ['k2', null],
        ]);
        const result = await storage.multiGet(['k1', 'k2']);
        expect(AsyncStorage.multiGet).toHaveBeenCalledWith(['k1', 'k2']);
        expect(result).toEqual([
            ['k1', 'v1'],
            ['k2', null],
        ]);
    });

    it('multiSet delegates to AsyncStorage.multiSet', async () => {
        (AsyncStorage.multiSet as jest.Mock).mockResolvedValue(undefined);
        await storage.multiSet([['k1', 'v1']]);
        expect(AsyncStorage.multiSet).toHaveBeenCalledWith([['k1', 'v1']]);
    });

    it('multiRemove delegates to AsyncStorage.multiRemove', async () => {
        (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
        await storage.multiRemove(['k1', 'k2']);
        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['k1', 'k2']);
    });

    it('getAllKeys delegates to AsyncStorage.getAllKeys and returns cast type', async () => {
        (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(['k1', 'k2']);
        const result = await storage.getAllKeys();
        expect(AsyncStorage.getAllKeys).toHaveBeenCalledWith();
        expect(result).toEqual(['k1', 'k2']);
    });

    it('clearAll delegates to AsyncStorage.clear', async () => {
        (AsyncStorage.clear as jest.Mock).mockResolvedValue(undefined);
        await storage.clearAll();
        expect(AsyncStorage.clear).toHaveBeenCalledWith();
    });
});
