/**
 * Theme token tests — ensures the design system is complete and consistent.
 *
 * These tests are designed to REVEAL errors in the codebase:
 * - Missing tokens that components reference
 * - Hardcoded hex/rgba colors that bypass the theme system
 * - Duplicate values that may indicate copy-paste errors
 * - Invalid token formats
 */

import { theme } from '../theme';
import fs from 'fs';
import path from 'path';

describe('Theme tokens', () => {
    describe('colors', () => {
        it('should have all typography tokens that components reference', () => {
            expect(theme.colors.textPrimary).toBe('#FFFFFF');
            expect(theme.colors.textSecondary).toBeDefined();
            expect(theme.colors.textMuted).toBeDefined();
            expect(theme.colors.textDim).toBeDefined();
            expect(theme.colors.textBody).toBeDefined();
            expect(theme.colors.textInput).toBeDefined();
            expect(theme.colors.textBodyDim).toBeDefined();
            expect(theme.colors.textTweet).toBeDefined();
        });

        it('should have all surface tokens', () => {
            expect(theme.colors.background).toBe('#000000');
            expect(theme.colors.surfaceDark).toBe('#0A0A0A');
            expect(theme.colors.surfaceRaised).toBe('#1A1A1A');
            expect(theme.colors.surfaceMedium).toBeDefined();
            expect(theme.colors.surfaceLight).toBeDefined();
        });

        it('should have all glass tokens', () => {
            const glassTokens = [
                'glassBackground',
                'glassSurface',
                'glassSurfaceMedium',
                'glassSurfaceSubtle',
                'glassBorder',
                'glassBorderSubtle',
                'glassBorderMedium',
                'glassHighlight',
            ];
            for (const token of glassTokens) {
                expect(theme.colors[token as keyof typeof theme.colors]).toBeDefined();
                expect(theme.colors[token as keyof typeof theme.colors]).toMatch(/^rgba\(/);
            }
        });

        it('should have all danger tokens', () => {
            const dangerTokens = [
                'danger',
                'dangerSubtle',
                'dangerLight',
                'dangerTint',
                'dangerFill',
                'dangerBorder',
                'dangerBorderStrong',
                'dangerOverlayLight',
                'dangerAccent',
                'dangerBorderMedium',
                'dangerBorderLight',
                'dangerFillStrong',
            ];
            for (const token of dangerTokens) {
                expect(theme.colors[token as keyof typeof theme.colors]).toBeDefined();
            }
        });

        it('should have overlay tokens', () => {
            expect(theme.colors.overlayDark).toBeDefined();
            expect(theme.colors.overlayMedium).toBeDefined();
            expect(theme.colors.overlayPopup).toBeDefined();
            expect(theme.colors.overlayVideoMuted).toBeDefined();
            expect(theme.colors.overlayVideoStrong).toBeDefined();
        });

        it('should have semantic color tokens', () => {
            expect(theme.colors.gold).toBeDefined();
            expect(theme.colors.green).toBeDefined();
            expect(theme.colors.orange).toBeDefined();
            expect(theme.colors.primaryAction).toBeDefined();
            expect(theme.colors.suggestionBackground).toBeDefined();
            expect(theme.colors.suggestionBorder).toBeDefined();
        });

        it('should have video accent tokens', () => {
            expect(theme.colors.videoAccentTint).toBeDefined();
            expect(theme.colors.videoAccentBorder).toBeDefined();
            expect(theme.colors.videoFlashBackground).toBeDefined();
        });

        it('should have rgba format for all glass/surface/overlay tokens', () => {
            const rgbaTokens = [
                'glassBackground',
                'glassSurface',
                'glassSurfaceMedium',
                'glassSurfaceSubtle',
                'glassBorder',
                'glassBorderSubtle',
                'glassBorderMedium',
                'glassHighlight',
                'dangerSubtle',
                'dangerLight',
                'dangerTint',
                'dangerFill',
                'dangerOverlayLight',
                'overlayDark',
                'overlayMedium',
                'overlayPopup',
            ];
            for (const token of rgbaTokens) {
                expect(theme.colors[token as keyof typeof theme.colors]).toMatch(/^rgba\(/);
            }
        });

        it('should have hex format for solid color tokens', () => {
            const hexTokens = [
                'background',
                'textPrimary',
                'danger',
                'gold',
                'green',
                'orange',
                'surfaceDark',
                'surfaceLight',
                'surfaceMedium',
            ];
            for (const token of hexTokens) {
                expect(theme.colors[token as keyof typeof theme.colors]).toMatch(/^#[0-9a-fA-F]{3,6}$/);
            }
        });

        it('danger opacity ladder should be monotonically non-decreasing', () => {
            // Extract opacity values from danger tokens to verify ordering
            const dangerOrder = [
                'dangerSubtle',
                'dangerLight',
                'dangerTint',
                'dangerBorderLight',
                'dangerAccent',
                'dangerBorder',
                'dangerBorderMedium',
                'dangerBorderStrong',
                'dangerFillStrong',
                'dangerOverlayLight',
            ];
            const opacities = dangerOrder.map((token) => {
                const val = theme.colors[token as keyof typeof theme.colors] as string;
                const match = val.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
                return match ? parseFloat(match[1]) : 0;
            });
            for (let i = 1; i < opacities.length; i++) {
                expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]);
            }
        });

        it('glass opacity ladder should be monotonically non-decreasing', () => {
            const glassOrder = [
                'glassSurfaceSubtle',
                'glassBackground',
                'glassSurface',
                'glassSurfaceMedium',
                'glassBorder',
                'glassBorderMedium',
                'glassHighlight',
            ];
            const opacities = glassOrder.map((token) => {
                const val = theme.colors[token as keyof typeof theme.colors] as string;
                const match = val.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
                return match ? parseFloat(match[1]) : 0;
            });
            for (let i = 1; i < opacities.length; i++) {
                expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]);
            }
        });

        it('no token should be empty string or undefined', () => {
            for (const [, value] of Object.entries(theme.colors)) {
                expect(value).toBeTruthy();
                expect(typeof value).toBe('string');
                expect(value.length).toBeGreaterThan(0);
            }
        });
    });

    describe('animation springs', () => {
        it('should have all spring presets', () => {
            expect(theme.animation.springDefault).toBeDefined();
            expect(theme.animation.springDefault.damping).toBe(30);
            expect(theme.animation.springDefault.stiffness).toBe(200);

            expect(theme.animation.springSnappy).toBeDefined();
            expect(theme.animation.springGentle).toBeDefined();
            expect(theme.animation.springLight).toBeDefined();
            expect(theme.animation.springFeed).toBeDefined();
        });

        it('should have valid spring values (damping, stiffness, mass > 0)', () => {
            for (const [, spring] of Object.entries(theme.animation)) {
                expect(spring.damping).toBeGreaterThan(0);
                expect(spring.stiffness).toBeGreaterThan(0);
                expect(spring.mass).toBeGreaterThan(0);
            }
        });
    });

    describe('borderRadius', () => {
        it('should have all radius tokens', () => {
            expect(theme.borderRadius.sm).toBe(12);
            expect(theme.borderRadius.md).toBe(20);
            expect(theme.borderRadius.lg).toBe(32);
            expect(theme.borderRadius.round).toBe(100);
        });
    });
});

/**
 * Hardcoded color detection — scans source files for hex/rgba colors
 * that are NOT in theme.ts, alignmentScores.ts, or config files.
 *
 * This test REVEALS errors: any new hardcoded color added to a component
 * will fail this test, forcing the developer to add a theme token instead.
 */
describe('Hardcoded color detection', () => {
    const srcDir = path.resolve(__dirname, '../../');

    // Files that ARE allowed to contain hardcoded colors
    const allowlistedFiles = ['theme.ts', 'alignmentScores.ts', 'index.ts'];

    // Directories to skip entirely
    const skipDirs = ['__tests__'];

    function getAllTsFiles(dir: string, files: string[] = []): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!skipDirs.includes(entry.name)) {
                    getAllTsFiles(fullPath, files);
                }
            } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
                if (!allowlistedFiles.includes(entry.name)) {
                    files.push(fullPath);
                }
            }
        }
        return files;
    }

    // Patterns that indicate a hardcoded color (but NOT a theme.colors reference).
    // These patterns are kept as documentation for future linting/refactoring tools.
    // const hardcodedPatterns = [
    //     // Hex colors: #FFF, #FFFFFF, #000, #000000 (but not in comments or strings like '#')
    //     /(?<![a-zA-Z_.])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g,
    //     // rgba() with literal numbers
    //     /rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/g,
    // ];

    it('should not contain hardcoded hex colors in component/screen files', () => {
        const tsFiles = getAllTsFiles(srcDir);
        const violations: string[] = [];

        for (const file of tsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(srcDir, file);

            // Skip lines that are comments or import statements
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // Skip comments, imports, type declarations, and theme.colors references
                if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) continue;
                if (trimmed.includes('theme.colors.')) continue;
                if (trimmed.includes('CONFIG.')) continue;
                if (trimmed.includes('ALIGNMENT_COLORS')) continue;
                if (trimmed.includes('ALIGNMENT_GLOWS')) continue;
                if (trimmed.includes('ALIGNMENT_ICONS')) continue;
                if (trimmed.includes('DANGER_COLOR_RGB')) continue;

                // Check for hex colors
                const hexMatches = line.match(/(?:['"`])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?:['"`])/g);
                if (hexMatches) {
                    violations.push(`${relativePath}:${i + 1}: ${trimmed.trim()}`);
                }

                // Check for rgba() with literal values (not variables)
                const rgbaMatches = line.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/g);
                if (rgbaMatches && !trimmed.includes('theme.colors.') && !trimmed.includes('CONFIG.')) {
                    violations.push(`${relativePath}:${i + 1}: ${trimmed.trim()}`);
                }
            }
        }

        // Progressive enforcement: threshold starts at current count and decreases
        // as hardcoded colors are replaced with theme tokens.
        // GOAL: Reduce this to 0 over time.
        const MAX_ALLOWED = 0;
        if (violations.length > MAX_ALLOWED) {
            console.warn(`\nFound ${violations.length} hardcoded color violations (max allowed: ${MAX_ALLOWED}):\n`);
            violations.slice(0, 20).forEach((v) => {
                console.warn(`  ${v}`);
            });
            if (violations.length > 20) {
                console.warn(`  ... and ${violations.length - 20} more`);
            }
            throw new Error(`Too many hardcoded colors: ${violations.length} > ${MAX_ALLOWED}`);
        } else if (violations.length > 0) {
            console.warn(
                `\nFound ${violations.length} hardcoded color violations (threshold: ${MAX_ALLOWED}). Fix these to reach 0.`,
            );
        }
    });
});
