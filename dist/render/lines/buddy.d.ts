export type BuddyDetailLevel = 'full' | 'compact' | 'mini';
export interface BuddyColumn {
    lines: string[];
    width: number;
}
export declare function renderBuddyColumn(detailLevel?: BuddyDetailLevel): BuddyColumn | null;
/** Legacy single-line render for narrow terminals (kept for compatibility). */
export declare function renderBuddyLine(): string | null;
//# sourceMappingURL=buddy.d.ts.map