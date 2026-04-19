import type { StoredCompanion } from './types.js';
export interface BuddyState {
    companion: StoredCompanion;
    seed: string;
    createdAt: number;
}
export declare function loadBuddyState(): BuddyState | null;
export declare function saveBuddyState(state: BuddyState): void;
export declare function generateBuddyState(): BuddyState;
export declare function ensureBuddyState(): BuddyState;
//# sourceMappingURL=state.d.ts.map