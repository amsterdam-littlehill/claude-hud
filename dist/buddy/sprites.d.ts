import type { CompanionBones, Species } from './types.js';
export declare function renderSprite(bones: CompanionBones, frame?: number): string[];
/** Render a sprite with spherical normal 3-D shading. */
export declare function renderSpriteDepth(bones: CompanionBones, frame?: number, timeMs?: number): string[];
export declare function spriteFrameCount(species: Species): number;
export declare function renderFace(bones: CompanionBones): string;
//# sourceMappingURL=sprites.d.ts.map