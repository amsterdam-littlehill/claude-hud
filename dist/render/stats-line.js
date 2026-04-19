import { label, RESET } from './colors.js';
/**
 * Render the stats line: working indicator, last skill, lines changed.
 *
 * Data sources:
 *   - Lines changed: stdin.cost.total_lines_added / total_lines_removed
 *   - Last skill: transcript.tools (last completed tool name)
 *   - Working indicator: presence of running tools in transcript
 */
export function renderStatsLine(ctx) {
    const display = ctx.config?.display;
    if (display?.showStats === false)
        return null;
    const colors = ctx.config?.colors;
    const parts = [];
    // Working/thinking indicator
    const hasRunningTools = ctx.transcript.tools.some(t => t.status === 'running');
    if (hasRunningTools) {
        parts.push(`${colors?.warning ? `\x1b[${getAnsiColorCode(colors.warning)}m` : ''}\u25D0${RESET}`);
    }
    // Last invoked skill
    const completedTools = ctx.transcript.tools.filter(t => t.status === 'completed');
    if (completedTools.length > 0) {
        const lastTool = completedTools[completedTools.length - 1];
        parts.push(`${label('skill', colors)} ${lastTool.name}`);
    }
    // Lines changed
    const cost = ctx.stdin.cost;
    if (cost) {
        const added = cost.total_lines_added ?? 0;
        const removed = cost.total_lines_removed ?? 0;
        if (added > 0 || removed > 0) {
            const changeParts = [];
            if (added > 0)
                changeParts.push(`+${added}`);
            if (removed > 0)
                changeParts.push(`-${removed}`);
            parts.push(changeParts.join(' '));
        }
    }
    if (parts.length === 0)
        return null;
    return parts.join(' | ');
}
function getAnsiColorCode(color) {
    if (typeof color === 'number') {
        return `38;5;${color}`;
    }
    const colorMap = {
        dim: '2',
        red: '31',
        green: '32',
        yellow: '33',
        magenta: '35',
        cyan: '36',
        brightBlue: '94',
        brightMagenta: '95',
    };
    return colorMap[color] ?? '33';
}
//# sourceMappingURL=stats-line.js.map