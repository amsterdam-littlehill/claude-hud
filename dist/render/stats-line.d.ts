import type { RenderContext } from '../types.js';
/**
 * Render the stats line: working indicator, last skill, lines changed.
 *
 * Data sources:
 *   - Lines changed: stdin.cost.total_lines_added / total_lines_removed
 *   - Last skill: transcript.tools (last completed tool name)
 *   - Working indicator: presence of running tools in transcript
 */
export declare function renderStatsLine(ctx: RenderContext): string | null;
//# sourceMappingURL=stats-line.d.ts.map