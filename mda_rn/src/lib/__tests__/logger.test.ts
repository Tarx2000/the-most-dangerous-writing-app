/* eslint-disable no-console */
describe('logger', () => {
    let originalDev: boolean;

    function getLoggerModule() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@/lib/logger') as typeof import('@/lib/logger');
    }

    beforeAll(() => {
        originalDev = (globalThis as unknown as { __DEV__: boolean }).__DEV__;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
        jest.resetModules();
    });

    describe('when __DEV__ is true', () => {
        beforeEach(() => {
            (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
            jest.resetModules();
        });

        it('logger(error, ...) always calls console.error', () => {
            const { logger } = getLoggerModule();
            logger('error', 'TestTag', 'error message', 'extra');
            expect(console.error).toHaveBeenCalledWith('[TestTag] error message', 'extra');
        });

        it('logger(warn, ...) calls console.warn', () => {
            const { logger } = getLoggerModule();
            logger('warn', 'TestTag', 'warn message', 'extra');
            expect(console.warn).toHaveBeenCalledWith('[TestTag] warn message', 'extra');
        });

        it('logger(info, ...) calls console.log', () => {
            const { logger } = getLoggerModule();
            logger('info', 'TestTag', 'info message', 'extra');
            expect(console.log).toHaveBeenCalledWith('[TestTag] info message', 'extra');
        });

        it('logger(debug, ...) calls console.log', () => {
            const { logger } = getLoggerModule();
            logger('debug', 'TestTag', 'debug message', 'extra');
            expect(console.log).toHaveBeenCalledWith('[TestTag] debug message', 'extra');
        });

        it('logStorage passes correct tag', () => {
            const { logStorage } = getLoggerModule();
            logStorage('info', 'storage msg');
            expect(console.log).toHaveBeenCalledWith('[Storage] storage msg');
        });

        it('logAi passes correct tag', () => {
            const { logAi } = getLoggerModule();
            logAi('info', 'ai msg');
            expect(console.log).toHaveBeenCalledWith('[AI] ai msg');
        });

        it('logAiQueue passes correct tag', () => {
            const { logAiQueue } = getLoggerModule();
            logAiQueue('info', 'queue msg');
            expect(console.log).toHaveBeenCalledWith('[AI Queue] queue msg');
        });

        it('logCompressor passes correct tag', () => {
            const { logCompressor } = getLoggerModule();
            logCompressor('info', 'compressor msg');
            expect(console.log).toHaveBeenCalledWith('[Compressor] compressor msg');
        });

        it('logDb passes correct tag', () => {
            const { logDb } = getLoggerModule();
            logDb('info', 'db msg');
            expect(console.log).toHaveBeenCalledWith('[DB] db msg');
        });

        it('logStartup passes correct tag', () => {
            const { logStartup } = getLoggerModule();
            logStartup('info', 'startup msg');
            expect(console.log).toHaveBeenCalledWith('[Startup] startup msg');
        });
    });

    describe('when __DEV__ is false', () => {
        beforeEach(() => {
            (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
            jest.resetModules();
        });

        it('logger(error, ...) still calls console.error', () => {
            const { logger } = getLoggerModule();
            logger('error', 'TestTag', 'error message', 'extra');
            expect(console.error).toHaveBeenCalledWith('[TestTag] error message', 'extra');
        });

        it('logger(warn, ...) does not call console.warn', () => {
            const { logger } = getLoggerModule();
            logger('warn', 'TestTag', 'warn message');
            expect(console.warn).not.toHaveBeenCalled();
        });

        it('logger(info, ...) does not call console.log', () => {
            const { logger } = getLoggerModule();
            logger('info', 'TestTag', 'info message');
            expect(console.log).not.toHaveBeenCalled();
        });

        it('logger(debug, ...) does not call console.log', () => {
            const { logger } = getLoggerModule();
            logger('debug', 'TestTag', 'debug message');
            expect(console.log).not.toHaveBeenCalled();
        });
    });
});
