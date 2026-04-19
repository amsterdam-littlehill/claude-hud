import { getBuddyCompanion } from '../../buddy/companion.js';
import { renderSprite, renderSpriteDepth, spriteFrameCount, renderFace } from '../../buddy/sprites.js';
import { ensureBuddyState } from '../../buddy/state.js';
import { dim } from '../colors.js';
// Idle animation sequence: frame indices with -1 as blink sentinel
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
// Simple ANSI stripper for width calculation (buddy sprites are ASCII-only)
// eslint-disable-next-line no-control-regex
function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}
function buddyVisualLength(str) {
    return stripAnsi(str ?? '').length;
}
export function renderBuddyColumn(detailLevel = 'full') {
    const state = ensureBuddyState();
    if (!state)
        return null;
    const companion = getBuddyCompanion(state.seed, state.companion);
    const tick = Math.floor(Date.now() / 500);
    const frameCount = spriteFrameCount(companion.species);
    const step = IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length];
    const spriteFrame = step === -1 ? 0 : step % frameCount;
    const blink = step === -1;
    if (detailLevel === 'mini') {
        const face = blink
            ? renderFace(companion).replaceAll(companion.eye, '-')
            : renderFace(companion);
        const allLines = [face];
        const maxWidth = Math.max(...allLines.map(buddyVisualLength));
        const padded = allLines.map(l => l + ' '.repeat(Math.max(0, maxWidth - buddyVisualLength(l))));
        return { lines: padded, width: maxWidth };
    }
    if (detailLevel === 'compact') {
        const spriteLines = renderSprite(companion, spriteFrame).map(l => blink ? l.replaceAll(companion.eye, '-') : l);
        const face = blink
            ? renderFace(companion).replaceAll(companion.eye, '-')
            : renderFace(companion);
        const allLines = [...spriteLines, face];
        const maxWidth = Math.max(...allLines.map(buddyVisualLength));
        const padded = allLines.map(l => l + ' '.repeat(Math.max(0, maxWidth - buddyVisualLength(l))));
        return { lines: padded, width: maxWidth };
    }
    // Full mode: fetch-style 3D rotating-light sprite only
    const spriteLines = renderSpriteDepth(companion, spriteFrame, Date.now()).map(l => blink ? l.replaceAll(companion.eye, dim('-')) : l);
    const maxWidth = Math.max(...spriteLines.map(buddyVisualLength));
    const padded = spriteLines.map(l => {
        const padLen = Math.max(0, maxWidth - buddyVisualLength(l));
        return l + ' '.repeat(padLen);
    });
    return { lines: padded, width: maxWidth };
}
/** Legacy single-line render for narrow terminals (kept for compatibility). */
export function renderBuddyLine() {
    const state = ensureBuddyState();
    if (!state)
        return null;
    const companion = getBuddyCompanion(state.seed, state.companion);
    const tick = Math.floor(Date.now() / 500);
    const frameCount = spriteFrameCount(companion.species);
    const step = IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length];
    const spriteFrame = step === -1 ? 0 : step % frameCount;
    const blink = step === -1;
    const lines = renderSprite(companion, spriteFrame).map(l => blink ? l.replaceAll(companion.eye, '-') : l);
    return lines.join('\n');
}
//# sourceMappingURL=buddy.js.map