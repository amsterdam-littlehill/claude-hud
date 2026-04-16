import { isLimitReached } from "../../types.js";
import { getProviderLabel, getModelName, formatModelName } from "../../stdin.js";
import { critical, label, getQuotaColor, quotaBar, RESET } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";
import { getDetectedProviderName } from "../../provider-usage.js";
export function renderUsageLine(ctx) {
    const display = ctx.config?.display;
    if (display?.showUsage === false || !ctx.usageData) {
        return null;
    }
    const mode = display?.usageDisplayMode ?? "compact";
    if (mode === "basic" || mode === "compact") {
        return null;
    }
    if (mode === "table") {
        return renderUsageTable(ctx);
    }
    if (mode === "badge") {
        return renderUsageBadge(ctx);
    }
    // Legacy fallback for official stdin usage without provider (rare with default compact)
    if (!getProviderLabel(ctx.stdin) && !getDetectedProviderName()) {
        return renderLegacyUsageLine(ctx);
    }
    return null;
}
function formatUsageValue(used, limit, percent) {
    if (typeof used === "number" && typeof limit === "number") {
        return `${used}/${limit}`;
    }
    if (typeof percent === "number") {
        return `${percent}%`;
    }
    return "--";
}
function formatResetTimePrecise(resetAt) {
    if (!resetAt)
        return "";
    const now = new Date();
    const diffMs = resetAt.getTime() - now.getTime();
    if (diffMs <= 0)
        return "";
    const diffMins = Math.ceil(diffMs / 60000);
    if (diffMins < 60)
        return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        return `${days}d${remHours}h`;
    }
    return `${hours}h${mins}m`;
}
function renderUsageTable(ctx) {
    const provider = getProviderLabel(ctx.stdin) ?? getDetectedProviderName() ?? "";
    const model = formatModelName(getModelName(ctx.stdin), ctx.config?.display?.modelFormat, ctx.config?.display?.modelOverride);
    const weekVal = formatUsageValue(ctx.usageData?.sevenDayUsed, ctx.usageData?.sevenDayLimit, ctx.usageData?.sevenDay);
    const fiveHourVal = formatUsageValue(ctx.usageData?.fiveHourUsed, ctx.usageData?.fiveHourLimit, ctx.usageData?.fiveHour);
    const weekReset = formatResetTimePrecise(ctx.usageData?.sevenDayResetAt ?? null);
    const fiveHourReset = formatResetTimePrecise(ctx.usageData?.fiveHourResetAt ?? null);
    const cols = {
        provider: { w: 10, label: t("label.provider"), val: provider },
        model: { w: 12, label: t("label.model"), val: model },
        weekUsed: { w: 10, label: t("label.weekUsed"), val: weekVal },
        weekReset: { w: 8, label: t("label.reset"), val: weekReset },
        fiveHourUsed: { w: 10, label: t("label.fiveHourUsed"), val: fiveHourVal },
        fiveHourReset: { w: 8, label: t("label.reset"), val: fiveHourReset },
    };
    const header = `${cols.provider.label.padEnd(cols.provider.w)} ` +
        `${cols.model.label.padEnd(cols.model.w)} ` +
        `${cols.weekUsed.label.padEnd(cols.weekUsed.w)} ` +
        `${cols.weekReset.label.padEnd(cols.weekReset.w)} ` +
        `${cols.fiveHourUsed.label.padEnd(cols.fiveHourUsed.w)} ` +
        `${cols.fiveHourReset.label.padEnd(cols.fiveHourReset.w)}`;
    const sep = "".padEnd(cols.provider.w, "─") +
        " " +
        "".padEnd(cols.model.w, "─") +
        " " +
        "".padEnd(cols.weekUsed.w, "─") +
        " " +
        "".padEnd(cols.weekReset.w, "─") +
        " " +
        "".padEnd(cols.fiveHourUsed.w, "─") +
        " " +
        "".padEnd(cols.fiveHourReset.w, "─");
    const data = `${cols.provider.val.padEnd(cols.provider.w)} ` +
        `${cols.model.val.padEnd(cols.model.w)} ` +
        `${cols.weekUsed.val.padEnd(cols.weekUsed.w)} ` +
        `${cols.weekReset.val.padEnd(cols.weekReset.w)} ` +
        `${cols.fiveHourUsed.val.padEnd(cols.fiveHourUsed.w)} ` +
        `${cols.fiveHourReset.val.padEnd(cols.fiveHourReset.w)}`;
    return [header, sep, data].join("\n");
}
function visibleLength(str) {
    // Strip ANSI escape sequences for visible width calculation
    return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}
function padEndVisible(str, targetWidth) {
    const pad = Math.max(0, targetWidth - visibleLength(str));
    return str + " ".repeat(pad);
}
function renderUsageBadge(ctx) {
    const colors = ctx.config?.colors;
    const provider = getProviderLabel(ctx.stdin) ?? getDetectedProviderName() ?? "";
    const model = formatModelName(getModelName(ctx.stdin), ctx.config?.display?.modelFormat, ctx.config?.display?.modelOverride);
    const title = provider ? `${provider} · ${model}` : model;
    const barWidth = getAdaptiveBarWidth();
    const weekVal = formatUsageValue(ctx.usageData?.sevenDayUsed, ctx.usageData?.sevenDayLimit, ctx.usageData?.sevenDay);
    const fiveHourVal = formatUsageValue(ctx.usageData?.fiveHourUsed, ctx.usageData?.fiveHourLimit, ctx.usageData?.fiveHour);
    const weekReset = formatResetTimePrecise(ctx.usageData?.sevenDayResetAt ?? null);
    const fiveHourReset = formatResetTimePrecise(ctx.usageData?.fiveHourResetAt ?? null);
    const weekLine = ctx.usageData?.sevenDay !== null
        ? `W:  ${quotaBar(ctx.usageData.sevenDay, barWidth, colors)} ${weekVal}${weekReset ? ` (${weekReset})` : ""}`
        : "";
    const fiveHourLine = ctx.usageData?.fiveHour !== null
        ? `5H: ${quotaBar(ctx.usageData.fiveHour, barWidth, colors)} ${fiveHourVal}${fiveHourReset ? ` (${fiveHourReset})` : ""}`
        : "";
    const rawWeek = `W:  ${"█".repeat(barWidth)} ${weekVal}${weekReset ? ` (${weekReset})` : ""}`;
    const rawFiveHour = `5H: ${"█".repeat(barWidth)} ${fiveHourVal}${fiveHourReset ? ` (${fiveHourReset})` : ""}`;
    const innerWidth = Math.max(title.length, rawWeek.length, rawFiveHour.length);
    const top = "┌ " + title.padEnd(innerWidth) + " ┐";
    const mid1 = "│ " + padEndVisible(weekLine, innerWidth) + " │";
    const mid2 = "│ " + padEndVisible(fiveHourLine, innerWidth) + " │";
    const bottom = "└ " + "".padEnd(innerWidth, "─") + " ┘";
    return [top, mid1, mid2, bottom].join("\n");
}
// ─── Legacy fallback for non-provider stdin usage ─────────────────────────────
function renderLegacyUsageLine(ctx) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    if (isLimitReached(ctx.usageData)) {
        const resetTime = ctx.usageData.fiveHour === 100
            ? formatResetTime(ctx.usageData.fiveHourResetAt)
            : formatResetTime(ctx.usageData.sevenDayResetAt);
        return `${label(t("label.usage"), colors)} ${critical(`⚠ ${t("status.limitReached")}${resetTime ? ` (${t("format.resets")} ${resetTime})` : ""}`, colors)}`;
    }
    const threshold = display?.usageThreshold ?? 0;
    const fiveHour = ctx.usageData.fiveHour;
    const sevenDay = ctx.usageData.sevenDay;
    const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);
    if (effectiveUsage < threshold) {
        return null;
    }
    const usageBarEnabled = display?.usageBarEnabled ?? true;
    const sevenDayThreshold = display?.sevenDayThreshold ?? 80;
    const barWidth = getAdaptiveBarWidth();
    if (fiveHour === null && sevenDay !== null) {
        const weeklyOnlyPart = formatUsageWindowPart({
            label: t("label.weekly"),
            percent: sevenDay,
            resetAt: ctx.usageData.sevenDayResetAt,
            colors,
            usageBarEnabled,
            barWidth,
            forceLabel: true,
        });
        return `${label(t("label.usage"), colors)} ${weeklyOnlyPart}`;
    }
    const fiveHourPart = formatUsageWindowPart({
        label: "5h",
        percent: fiveHour,
        resetAt: ctx.usageData.fiveHourResetAt,
        colors,
        usageBarEnabled,
        barWidth,
    });
    if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
        const sevenDayPart = formatUsageWindowPart({
            label: t("label.weekly"),
            percent: sevenDay,
            resetAt: ctx.usageData.sevenDayResetAt,
            colors,
            usageBarEnabled,
            barWidth,
            forceLabel: true,
        });
        return `${label(t("label.usage"), colors)} ${fiveHourPart} | ${sevenDayPart}`;
    }
    return `${label(t("label.usage"), colors)} ${fiveHourPart}`;
}
function formatUsagePercent(percent, colors) {
    if (percent === null) {
        return label("--", colors);
    }
    const color = getQuotaColor(percent, colors);
    return `${color}${percent}%${RESET}`;
}
function formatUsageWindowPart({ label: windowLabel, percent, resetAt, colors, usageBarEnabled, barWidth, forceLabel = false, }) {
    const usageDisplay = formatUsagePercent(percent, colors);
    const reset = formatResetTime(resetAt);
    const styledLabel = label(windowLabel, colors);
    if (usageBarEnabled) {
        const body = reset
            ? `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay} (${t("format.resetsIn")} ${reset})`
            : `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay}`;
        return forceLabel ? `${styledLabel} ${body}` : body;
    }
    return reset
        ? `${styledLabel} ${usageDisplay} (${t("format.resetsIn")} ${reset})`
        : `${styledLabel} ${usageDisplay}`;
}
function formatResetTime(resetAt) {
    if (!resetAt)
        return "";
    const now = new Date();
    const diffMs = resetAt.getTime() - now.getTime();
    if (diffMs <= 0)
        return "";
    const diffMins = Math.ceil(diffMs / 60000);
    if (diffMins < 60)
        return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        if (remHours > 0)
            return `${days}d ${remHours}h`;
        return `${days}d`;
    }
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
//# sourceMappingURL=usage.js.map