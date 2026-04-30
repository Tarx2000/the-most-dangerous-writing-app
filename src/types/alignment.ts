import type { SavedNote } from './note';

/**
 * Type guard for AlignmentReflection.
 *
 * Why this exists: AlignmentReflection extends SavedNote with extra fields
 * (alignmentScore, stopText, startText, continueText). TypeScript's structural
 * typing can't distinguish them at runtime — the `isAlignmentReflection: true`
 * boolean field is the runtime discriminator that lets us narrow the union type
 * in if/switch blocks without `as any` casts.
 */
export function isAlignmentReflection(note: SavedNote): note is AlignmentReflection {
    return (note as AlignmentReflection).isAlignmentReflection === true;
}

export interface AlignmentReflection extends SavedNote {
    alignmentScore: number;
    stopText: string;
    startText: string;
    continueText: string;
    isAlignmentReflection: true;
}
