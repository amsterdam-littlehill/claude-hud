import { type Companion, type CompanionBones } from './types.js';
export type Roll = {
    bones: CompanionBones;
    inspirationSeed: number;
};
export declare function roll(userId: string): Roll;
export declare function rollWithSeed(seed: string): Roll;
export declare function getCompanion(userId: string, stored: import('./types.js').StoredCompanion | undefined): Companion | undefined;
export declare function getBuddyCompanion(seed: string, stored: import('./types.js').StoredCompanion): Companion;
//# sourceMappingURL=companion.d.ts.map