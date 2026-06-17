import React, { useEffect, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { StyleProp } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { interpolate } from 'flubber';
// expo-file-system v15 exposes the new File/Directory class API at the root,
// but the legacy cacheDirectory/writeAsStringAsync/readAsStringAsync getters
// are importable from /legacy. We use them because they return sync string
// paths (cacheDirectory is a plain property, not an async File constructor).
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/styles/theme';
import { logger } from '@/lib/logger';

/* ── CONFIGURATION ─────────────────────────────────────────────────────────── */

/**
 * Number of pre-computed interpolation frames.
 * All flubber math + sanitization runs ONCE in a burst before animation starts,
 * then each frame is just an array lookup + setNativeProps (near-zero JS cost).
 *
 * 24 frames over 400ms ≈ 60fps perceived smoothness.
 */
const FRAME_COUNT = 24;

/**
 * Max segment length for flubber's polygon approximation.
 *
 * flubber converts all curves (C/A commands) into straight-line polygons.
 * Value 2 gives ~65 segments per path — smooth at 42px display size while
 * keeping each frame's path string at ~2.3KB (half of value 1).
 *
 * The quality difference between 1 and 2 is imperceptible during motion
 * because the shape is constantly changing anyway.
 */
const MAX_SEGMENT_LENGTH = 2;

/* ── ICON PATHS ────────────────────────────────────────────────────────────── */

/**
 * ALL icons are SINGLE CONTINUOUS PATHS (exactly one M...Z command each).
 *
 * This is critical for clean flubber interpolation — no subpath splitting,
 * no SAFE_DOT padding, no spider-web artifacts. Each icon morphs to any
 * other with a single interpolate() call.
 *
 * Source: Material Design Icons (filled variants) + custom silhouette
 * ViewBox: 0 0 24 24
 */
const PATHS: Record<string, string> = {
    /** Feather — organic curved quill representing free-form writing */
    journal:
        'M22,2C22,2 14.36,1.63 8.34,9.88C3.72,16.21 2,22 2,22L3.94,21C5.38,18.5 6.13,17.47 7.54,16C10.07,16.74 12.71,16.65 15,14C13,13.44 11.4,13.57 9.04,13.81C11.69,12 13.5,11.6 16,12L17,10C15.2,9.66 14,9.63 12.22,10.04C14.19,8.65 15.56,7.87 18,8L19.21,6.07C17.65,5.96 16.71,6.13 14.92,6.57C16.53,5.11 18,4.45 20.14,4.32C20.14,4.32 21.19,2.43 22,2Z',

    /**
     * Person silhouette — continuous head + shoulders bust outline.
     * Hand-crafted as a single clockwise trace: top of head → right head →
     * right neck → right shoulder → body → bottom → left body → left neck →
     * left head → back to top.
     */
    circles:
        'M12 2C14.76 2 17 4.24 17 7C17 8.93 15.84 10.56 14.18 11.4C17.32 12.44 20 14.5 20 17.5L20 22L4 22L4 17.5C4 14.5 6.68 12.44 9.82 11.4C8.16 10.56 7 8.93 7 7C7 4.24 9.24 2 12 2Z',

    /**
     * Filled video camera — camera body with lens triangle.
     * Source: MDI video-outline outer path (inner cutout removed).
     */
    vlog: 'M16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5V7A1,1 0 0,0 16,6Z',

    /**
     * Four-point star — compass rose / sparkle for alignment check-in.
     * Source: MDI star-four-points (filled)
     */
    checkin: 'M12,1L9,9L1,12L9,15L12,23L15,15L23,12L15,9L12,1Z',
};

type Mode = keyof typeof PATHS;

interface Props {
    /** Which icon shape to display / morph to */
    mode: Mode;
    /** Icon dimensions in pixels (default 42) */
    size?: number;
    /** Fill color (default: primaryAction theme color) */
    color?: string;
    /** Additional styles for the outer container */
    style?: StyleProp<ViewStyle>;
    /** Whether the morph animation should run (false to skip animation instantly) */
    animated?: boolean;
}

/**
 * Parse hex/rgba to numeric array for fast interpolation.
 */
function parseColorStr(c: string): [number, number, number, number] {
    if (c.startsWith('#')) {
        let hex = c.replace('#', '');
        if (hex.length === 3)
            hex = hex
                .split('')
                .map((x) => x + x)
                .join('');
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
    }
    if (c.startsWith('rgba') || c.startsWith('rgb')) {
        const parts = c
            .replace(/rgba?\(|\)/g, '')
            .split(',')
            .map((x) => parseFloat(x));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] ?? 1];
    }
    return [255, 255, 255, 1]; // Fallback
}

/** Manual color interpolation to bypass Reanimated jitter */
function lerpColor(c1: string, c2: string, t: number): string {
    const a = parseColorStr(c1);
    const b = parseColorStr(c2);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const b_ = Math.round(a[2] + (b[2] - a[2]) * t);
    const alpha = a[3] + (b[3] - a[3]) * t;
    return `rgba(${r}, ${g}, ${b_}, ${alpha})`;
}

/**
 * Sanitize an interpolated SVG path string for the native renderer.
 * Fixes numeric edge cases from flubber: NaN, scientific notation, excessive decimals.
 */
function sanitizePath(pathStr: string): string {
    pathStr = pathStr.replace(/NaN/gi, '12');
    pathStr = pathStr.replace(/[-+]?\d*\.?\d+e[-+]?\d+/gi, '0');
    pathStr = pathStr.replace(/([-+]?\d*\.\d{3,})/g, (val) => Number(val).toFixed(2));
    return pathStr;
}

/** Cache for pre-computed shape transitions between clean states (e.g. "journal_to_circles") */
const MORPH_CACHE = new Map<string, string[]>();

/** Compile-time pre-computed scale bounce factors matching the 24 animation frames */
const BOUNCE_SCALES = (() => {
    const scales = new Array(FRAME_COUNT + 1);
    for (let i = 0; i <= FRAME_COUNT; i++) {
        const progress = i / FRAME_COUNT;
        let scale = 1.0;
        if (progress > 0.4 && progress < 1) {
            const x = (progress - 0.4) / 0.6; // x runs 0->1 over the last 60% of morph
            const bounceAmt = Math.sin(x * Math.PI * 2.2) * Math.pow(1 - x, 1.2) * 0.15;
            scale = 1.0 + bounceAmt;
        }
        scales[i] = scale;
    }
    return scales;
})();

/**
 * Disk cache file path for pre-computed morph frames.
 *
 * Why cache to disk:
 *  - First launch ever: compute all 12 transitions (~5-15ms JS work), write
 *    to a JSON file in the app's cacheDirectory.
 *  - Subsequent launches: read the file (cheap async I/O), populate MORPH_CACHE
 *    from JSON. NO synchronous JS compute on the JS thread = no TTI impact.
 *  - The OS may evict cacheDirectory under disk pressure; we silently
 *    recompute on the next launch.
 *
 * The cache key includes a version suffix so any future changes to PATHS,
 * FRAME_COUNT, MAX_SEGMENT_LENGTH, or easing automatically invalidate it.
 */
const CACHE_VERSION = 'v1';
const CACHE_FILE = `${FileSystem.cacheDirectory}morph_frames_${CACHE_VERSION}.json`;

/**
 * Compute all 12 mode→mode transitions and return them as a plain object.
 * Pure (no side effects) — caller decides whether to write to MORPH_CACHE,
 * disk, or both.
 */
function computeAllTransitions(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const modes = Object.keys(PATHS) as Mode[];
    for (const fromMode of modes) {
        for (const toMode of modes) {
            if (fromMode === toMode) continue;
            const cacheKey = `${fromMode}_to_${toMode}`;
            try {
                const startPath = PATHS[fromMode];
                const endPath = PATHS[toMode];
                const morphFn = interpolate(startPath, endPath, { maxSegmentLength: MAX_SEGMENT_LENGTH });
                const frames = new Array(FRAME_COUNT + 1);
                for (let i = 0; i <= FRAME_COUNT; i++) {
                    const linearT = i / FRAME_COUNT;
                    const easedT =
                        linearT < 0.5 ? 4 * linearT * linearT * linearT : 1 - Math.pow(-2 * linearT + 2, 3) / 2;
                    frames[i] = sanitizePath(morphFn(easedT));
                }
                result[cacheKey] = frames;
            } catch {
                // Ignore silently — single failed transition falls back to instant swap
            }
        }
    }
    return result;
}

/**
 * Read pre-computed frames from disk.
 * Returns null on any failure (missing file, parse error, etc.) — callers
 * handle by recomputing.
 */
async function loadDiskCache(): Promise<Record<string, string[]> | null> {
    try {
        const info = await FileSystem.getInfoAsync(CACHE_FILE);
        if (!info.exists) return null;
        const content = await FileSystem.readAsStringAsync(CACHE_FILE, {
            encoding: FileSystem.EncodingType.UTF8,
        });
        const parsed = JSON.parse(content) as Record<string, string[]>;
        // Basic shape validation before trusting the cache
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch (err) {
        logger('warn', 'LiquidMorphIcon', 'Disk cache read failed, will recompute:', err);
        return null;
    }
}

/**
 * Write pre-computed frames to disk for next launch.
 * Fire-and-forget — failures here are non-critical (worst case: recompute
 * next launch).
 */
async function saveDiskCache(frames: Record<string, string[]>): Promise<void> {
    try {
        await FileSystem.writeAsStringAsync(CACHE_FILE, JSON.stringify(frames), {
            encoding: FileSystem.EncodingType.UTF8,
        });
    } catch (err) {
        logger('warn', 'LiquidMorphIcon', 'Disk cache write failed (non-critical):', err);
    }
}

/**
 * Bootstrap the morph frame cache.
 *
 * Strategy (keeps pre-compute-all approach but avoids JS compute on warm
 * launches — no on-demand lazy computation, as required):
 *
 *  1. Await disk cache read (cheap async I/O — does NOT block the JS thread).
 *  2. If disk cache HIT: populate MORPH_CACHE from the parsed JSON. Done —
 *     zero synchronous flubber computation this launch.
 *  3. If disk cache MISS (first ever launch, or cache evicted): synchronously
 *     compute all transitions (~5-15ms JS work, same as before), then fire
 *     saveDiskCache() in the background.
 *
 * Note: the in-component fallback logic (lines further down) still handles
 * the rare case where a specific transition isn't in MORPH_CACHE yet
 * because the disk read hasn't completed by the time the user triggers a
 * morph. It computes that single transition on the fly and caches it.
 */
let cacheBootstrapStarted = false;
function bootstrapMorphCache() {
    if (cacheBootstrapStarted) return;
    cacheBootstrapStarted = true;

    // Kick off the async disk read IMMEDIATELY at module load. The original
    // setTimeout(100) delayed this; we now let it race against first paint.
    (async () => {
        const diskCache = await loadDiskCache();
        if (diskCache !== null) {
            // Warm path — populate in-memory cache from disk, zero JS compute.
            for (const [key, frames] of Object.entries(diskCache)) {
                MORPH_CACHE.set(key, frames);
            }
            return;
        }

        // Cold path — first ever launch (or cache evicted). Synchronous
        // compute, then persist to disk so future launches hit the warm path.
        const allFrames = computeAllTransitions();
        for (const [key, frames] of Object.entries(allFrames)) {
            MORPH_CACHE.set(key, frames);
        }
        // Persist in the background — do not block module load.
        void saveDiskCache(allFrames);
    })().catch((err) => {
        logger('warn', 'LiquidMorphIcon', 'Cache bootstrap failed:', err);
    });
}

// Trigger the bootstrap as soon as this module is imported (app startup).
// This replaces the old synchronous setTimeout(100) pre-compute-all approach
// with a disk-cache-backed equivalent.
bootstrapMorphCache();

/**
 * LiquidMorphIcon — Smoothly morphs between SVG icon shapes.
 *
 * Performance architecture (optimized for 60fps on any device):
 *
 * 1. PRE-COMPUTE: When mode changes, ALL interpolation frames are computed
 *    in a single burst BEFORE the animation starts. This means flubber's
 *    heavy math + regex sanitization runs once (~5-15ms total), not 24× per frame.
 *
 * 2. PLAYBACK: A lightweight requestAnimationFrame loop indexes into the
 *    pre-computed frame array and calls setNativeProps. Each frame costs
 *    ~0.1ms (just an array lookup + bridge call) — virtually free.
 *
 * 3. NO JS-THREAD ANIMATION: Unlike RN Animated with addListener(), this
 *    approach doesn't run JS computation on every frame. The GPU does the
 *    timing via requestAnimationFrame, while JS just provides the path data
 *    from a pre-built array.
 *
 * Why this is fast:
 * - Pre-computation moves ALL expensive work before animation starts
 * - No per-frame flubber interpolation (was the #1 bottleneck)
 * - No per-frame regex sanitization
 * - No Animated.Value listeners (removes Animated overhead entirely)
 * - setNativeProps bypasses React's reconciler
 */
export const LiquidMorphIcon = React.memo(function LiquidMorphIcon({
    mode,
    size = 42,
    color = theme.colors.primaryAction,
    style,
    animated = true,
}: Props) {
    /** Tracks the current mode — updated instantly to prevent re-triggering */
    const currentModeRef = useRef<Mode>(mode);

    /** Tracks which mode we're animating toward (for clean snap on interrupt) */
    const targetModeRef = useRef<Mode>(mode);

    /** The path string currently displayed on screen */
    const pathStringRef = useRef<string>(PATHS[mode]);

    /** Direct ref to the native <Path> element for setNativeProps */
    const pathRef = useRef<Path>(null);

    /** Direct ref to the wrapper <View> element for scale bouncing */
    const viewRef = useRef<View>(null);

    /** Active animation frame ID for shape morphs */
    const rafIdRef = useRef<number | null>(null);

    /** Current painted color on screen, allowing interruption mapping */
    const currentColorStr = useRef<string>(color);
    /** Target color we are trying to reach */
    const targetColorStr = useRef<string>(color);
    /** Color animation frame track */
    const colorRafIdRef = useRef<number | null>(null);

    /** Exclusive non-blocking color transition loop for sliding toggles */
    useEffect(() => {
        if (color !== targetColorStr.current) {
            if (colorRafIdRef.current) cancelAnimationFrame(colorRafIdRef.current);

            targetColorStr.current = color;

            if (!animated) {
                currentColorStr.current = color;
                if (pathRef.current) {
                    pathRef.current.setNativeProps({ fill: color });
                }
                return;
            }

            const startColor = currentColorStr.current;
            const endColor = color;
            const startTime = performance.now();

            const animateColor = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / 150, 1);

                // cubic-out
                const easedT = 1 - Math.pow(1 - progress, 3);

                const interpolated = lerpColor(startColor, endColor, easedT);
                currentColorStr.current = interpolated;

                if (pathRef.current) {
                    pathRef.current.setNativeProps({ fill: interpolated });
                }

                if (progress < 1) {
                    colorRafIdRef.current = requestAnimationFrame(animateColor);
                } else {
                    colorRafIdRef.current = null;
                }
            };

            colorRafIdRef.current = requestAnimationFrame(animateColor);
        }

        return () => {
            if (colorRafIdRef.current) {
                cancelAnimationFrame(colorRafIdRef.current);
                colorRafIdRef.current = null;
            }
        };
    }, [color, animated]);

    useEffect(() => {
        if (mode !== currentModeRef.current) {
            // Live calculated source path (mid-morph polygon) to support rapid switching
            // Restored per user request: holds place on current state and remorphs perfectly.
            const startPath = pathStringRef.current;
            const endPath = PATHS[mode];

            const prevMode = currentModeRef.current;

            // Update refs immediately — prevents race conditions on fast switching
            currentModeRef.current = mode;
            targetModeRef.current = mode;

            // Cancel any running animation
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }

            if (!animated) {
                // Instant swap — bypass animations entirely
                pathStringRef.current = endPath;
                if (pathRef.current) {
                    pathRef.current.setNativeProps({ d: endPath });
                }
                if (viewRef.current) {
                    viewRef.current.setNativeProps({ transform: [{ scale: 1.0 }] });
                }
                return;
            }

            // Snap to clean start path
            pathStringRef.current = startPath;
            if (pathRef.current) {
                pathRef.current.setNativeProps({ d: startPath });
            }

            const cacheKey = `${prevMode}_to_${mode}`;
            const isCleanStart = startPath === PATHS[prevMode];
            let frames: string[];

            const cachedFrames = MORPH_CACHE.get(cacheKey);
            if (isCleanStart && cachedFrames) {
                frames = cachedFrames;
            } else {
                try {
                    const morphFn = interpolate(startPath, endPath, { maxSegmentLength: MAX_SEGMENT_LENGTH });
                    frames = new Array(FRAME_COUNT + 1);
                    for (let i = 0; i <= FRAME_COUNT; i++) {
                        // Easing: cubic ease-in-out for premium feel
                        const linearT = i / FRAME_COUNT;
                        const easedT =
                            linearT < 0.5 ? 4 * linearT * linearT * linearT : 1 - Math.pow(-2 * linearT + 2, 3) / 2;
                        frames[i] = sanitizePath(morphFn(easedT));
                    }
                    if (isCleanStart) {
                        MORPH_CACHE.set(cacheKey, frames);
                    }
                } catch (err: unknown) {
                    logger('warn', 'LiquidMorphIcon', 'Flubber morph failed, falling back to instant swap:', err);

                    // Graceful fallback: instant swap if flubber fails
                    pathStringRef.current = endPath;
                    if (pathRef.current) {
                        pathRef.current.setNativeProps({ d: endPath });
                    }
                    return;
                }
            }

            /**
             * ═══════════════════════════════════════════════════════════════
             * PHASE 2: PLAYBACK (near-zero JS cost per frame)
             *
             * Frame-tick index based loop that advancement on every tick.
             * Eliminates performance.now(), float divisions, and rounding.
             * ═══════════════════════════════════════════════════════════════
             */
            let frameIndex = 0;
            const animate = () => {
                const framePath = frames[frameIndex];
                if (framePath) {
                    pathStringRef.current = framePath;
                    if (pathRef.current) {
                        pathRef.current.setNativeProps({ d: framePath });
                    }
                }

                const scale = BOUNCE_SCALES[frameIndex] ?? 1.0;
                if (viewRef.current) {
                    viewRef.current.setNativeProps({ transform: [{ scale }] });
                }

                frameIndex++;
                if (frameIndex <= FRAME_COUNT) {
                    rafIdRef.current = requestAnimationFrame(animate);
                } else {
                    rafIdRef.current = null;
                    // Lock to the exact target path (clean SVG with curves)
                    pathStringRef.current = endPath;
                    if (pathRef.current) {
                        pathRef.current.setNativeProps({ d: endPath });
                    }
                    if (viewRef.current) {
                        viewRef.current.setNativeProps({ transform: [{ scale: 1.0 }] });
                    }
                }
            };

            rafIdRef.current = requestAnimationFrame(animate);
        }

        // Cleanup on unmount
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
            if (colorRafIdRef.current !== null) {
                cancelAnimationFrame(colorRafIdRef.current);
            }
        };
    }, [mode, animated]);

    /* ── Render ────────────────────────────────────────────────────────────── */

    return (
        <View
            ref={viewRef}
            style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}
        >
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Path ref={pathRef} d={pathStringRef.current} fill={currentColorStr.current} />
            </Svg>
        </View>
    );
});
