/**
 * Shape-vector based character analysis for buddy depth rendering.
 *
 * Inspired by Alex Harri's ASCII rendering:
 * https://alexharri.com/blog/ascii-rendering
 *
 * Each character is represented by a 6D vector measuring approximate
 * "ink coverage" in a 3x2 staggered grid within the character cell.
 *
 *   [0] top-left   [1] top-mid   [2] top-right
 *   [3] bot-left   [4] bot-mid   [5] bot-right
 *
 * This replaces the coarse 4-bucket charDensity() heuristic with
 * continuous, shape-aware density and per-character surface normals.
 */
export type ShapeVector = [number, number, number, number, number, number];
/**
 * Pre-computed shape vectors for ASCII characters.
 * Values are hand-tuned approximations of ink distribution
 * in a typical monospace font cell.
 */
export declare const CHAR_SHAPE_VECTORS: Record<string, ShapeVector>;
/** Get the pre-computed shape vector for a character. */
export declare function getShapeVector(ch: string): ShapeVector;
/** Continuous density from shape vector (0.0 = empty, 1.0 = fully covered). */
export declare function shapeDensity(ch: string): number;
/**
 * Extract a local surface normal from a character's shape vector.
 * Captures intrinsic directionality: '/' leans left, '(' opens right, '^' points up.
 * Returns a unit-length vector for blending with gradient-based normals.
 */
export declare function shapeNormal(ch: string): [number, number, number];
//# sourceMappingURL=shape-vectors.d.ts.map