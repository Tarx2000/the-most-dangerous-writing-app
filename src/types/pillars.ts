/**
 * Pillars & Advice Tracking System Type Definitions
 */

export interface Pillar {
    id: string;
    title: string;
    type: 'rating' | 'time' | 'boolean' | 'text';
    scope: 'daily' | 'weekly' | 'adaptive';
    createdAt: number;
    lastEditedAt: number; // track when checking rules were modified
    adaptiveDays: number; // Graduating threshold (e.g., 14 days)
    isActive: boolean;
    description?: string; // Guidelines, sources, and detailed explanation
    version: number; // Rule schema version incremented on edit
}

export interface PillarVersion {
    id: string;
    pillarId: string;
    version: number;
    title: string;
    description?: string;
    createdAt: number;
}

export interface AdviceCard {
    id: string;
    text: string;
    createdAt: number;
    lastReflectedAt: number | null;
    reflectionCount: number;
    isActive: boolean;
}

export interface PillarLog {
    id: string;
    pillarId: string;
    valueNum: number | null; // Numeric representation (e.g., 7.5, 8.0, 1.0/0.0)
    valueStr: string | null; // Formatted display representation (e.g., "07:30", "Yes")
    timestamp: number;
    noteId: string | null; // Foreign key link to the written note (if a reflection was saved)
}
