import { formatBytes } from "../../memory.js";
import { label, getQuotaColor, RESET } from "../colors.js";
import { t } from "../../i18n/index.js";
export function renderMemoryLine(ctx) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    if (ctx.config?.lineLayout !== "expanded") {
        return null;
    }
    if (display?.showMemoryUsage !== true) {
        return null;
    }
    if (!ctx.memoryUsage) {
        return null;
    }
    const memoryLabel = label(t("label.approxRam"), colors);
    const percentColor = getQuotaColor(ctx.memoryUsage.usedPercent, colors);
    const percent = `${percentColor}${ctx.memoryUsage.usedPercent}%${RESET}`;
    return `${memoryLabel} ${formatBytes(ctx.memoryUsage.usedBytes)} / ${formatBytes(ctx.memoryUsage.totalBytes)} (${percent})`;
}
//# sourceMappingURL=memory.js.map