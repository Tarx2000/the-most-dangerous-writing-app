/**
 * Design-token guard tests.
 *
 * These tests scan the UI source tree (src/screens + src/components) for
 * HARD-CODED design values that should come from `theme` tokens instead:
 *   - color literals (`#hex`, `rgb()`, `rgba()`) outside the theme file
 *   - `Math.random()` used as a list key (breaks reconciliation/FlashList)
 *   - `allowFontScaling={false}` (breaks Dynamic Type / large text)
 *
 * Any new hard-coded color found means the design-token discipline slipped;
 * the fix is to add a `theme.colors.*` token and use it (never extend the
 * allowlist for new code).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SCAN_DIRS = ['src/screens', 'src/components'];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Files that legitimately build dynamic rgba colors from animated values. */
const DYNAMIC_COLOR_ALLOWLIST = new Set([path.join(ROOT, 'src/components/features/writing/VaporizingText.tsx')]);

const HEX_COLOR_RE = /['"]#[0-9a-fA-F]{3,8}['"]/g;
const RGB_COLOR_RE = /['"]rgba?\(\s*[\d.,\s]+\)['"]/g;

/** Remove block + line comments so documentation never triggers a false positive. */
function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.isFile() && FILE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
    }
    return out;
}

function collectUiFiles(): string[] {
    return SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
}

describe('design token discipline', () => {
    const files = collectUiFiles();
    it('scans a non-trivial set of UI files', () => {
        expect(files.length).toBeGreaterThanOrEqual(50);
    });

    it('forbids hard-coded color literals in UI files (use theme.colors.* tokens)', () => {
        const offenders: { file: string; line: number; value: string }[] = [];

        for (const file of files) {
            if (DYNAMIC_COLOR_ALLOWLIST.has(file)) continue;
            const code = stripComments(fs.readFileSync(file, 'utf-8'));
            const lines = code.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const hexMatches = line.match(HEX_COLOR_RE) || [];
                const rgbMatches = line.match(RGB_COLOR_RE) || [];
                for (const value of [...hexMatches, ...rgbMatches]) {
                    offenders.push({ file: path.relative(ROOT, file), line: i + 1, value });
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it('forbids Math.random() as a list key (breaks FlashList reconciliation)', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const code = stripComments(fs.readFileSync(file, 'utf-8'));
            // Only flag Math.random() inside a keyExtractor callback or a key={} prop —
            // Math.random() elsewhere (e.g. generating an id) is legitimate.
            const inKeyExtractor = /keyExtractor\s*=[\s\S]{0,200}?Math\.random\(\)/.test(code);
            const inKeyProp = /key=\{[^}]*Math\.random\(\)/.test(code);
            if (inKeyExtractor || inKeyProp) {
                offenders.push(path.relative(ROOT, file));
            }
        }
        expect(offenders).toEqual([]);
    });

    it('forbids allowFontScaling={false} (must respect Dynamic Type / large text)', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const code = stripComments(fs.readFileSync(file, 'utf-8'));
            if (/allowFontScaling=\{false\}/.test(code)) {
                offenders.push(path.relative(ROOT, file));
            }
        }
        expect(offenders).toEqual([]);
    });
});
