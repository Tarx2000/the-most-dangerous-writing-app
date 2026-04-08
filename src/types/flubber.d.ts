declare module 'flubber' {
    export interface FlubberOptions {
        maxSegmentLength?: number;
        single?: boolean;
    }
    
    export function interpolate(fromShape: string | string[], toShape: string | string[], options?: FlubberOptions): (t: number) => string;
    export function combine(fromShapes: string[], toShape: string, options?: FlubberOptions): (t: number) => string;
    export function separate(fromShape: string, toShapes: string[], options?: FlubberOptions): (t: number) => string;
    export function interpolateAll(fromShapes: string[], toShapes: string[], options?: FlubberOptions): (t: number) => string;
}
