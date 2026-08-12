import { getAllVlogs } from '../repositories/vlogsRepository';
import { getAll } from '@/lib/db';

jest.mock('@/lib/db', () => ({
    getAll: jest.fn(),
    run: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///new-device-documents/',
}));

describe('vlogsRepository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should dynamically correct file path and thumbnail path to match current documentDirectory', async () => {
        const mockRows = [
            {
                id: 'vlog-1',
                file_path: 'file:///old-device-documents/vlogs/vlog-1.mp4',
                date_str: '2026-07-08',
                timestamp: 123456789,
                duration_sec: 15,
                file_size_bytes: 10240,
                thumbnail_path: 'file:///old-device-documents/vlog_thumbnails/thumb-1.jpg',
                compression_preset: 'balanced',
                original_file_size_bytes: 20480,
                compression_pending: 0,
            },
        ];

        (getAll as jest.Mock).mockResolvedValue(mockRows);

        const vlogs = await getAllVlogs();

        expect(vlogs).toHaveLength(1);
        expect(vlogs[0].filePath).toBe('file:///new-device-documents/vlogs/vlog-1.mp4');
        expect(vlogs[0].thumbnailPath).toBe('file:///new-device-documents/vlog_thumbnails/thumb-1.jpg');
    });

    it('should handle null thumbnail_path gracefully', async () => {
        const mockRows = [
            {
                id: 'vlog-2',
                file_path: 'file:///old-device-documents/vlogs/vlog-2.mp4',
                date_str: '2026-07-08',
                timestamp: 123456790,
                duration_sec: 10,
                file_size_bytes: 5120,
                thumbnail_path: null,
                compression_preset: null,
                original_file_size_bytes: null,
                compression_pending: 1,
            },
        ];

        (getAll as jest.Mock).mockResolvedValue(mockRows);

        const vlogs = await getAllVlogs();

        expect(vlogs).toHaveLength(1);
        expect(vlogs[0].filePath).toBe('file:///new-device-documents/vlogs/vlog-2.mp4');
        expect(vlogs[0].thumbnailPath).toBeUndefined();
    });
});
