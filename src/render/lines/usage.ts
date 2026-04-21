import type { RenderContext } from "../../types.js";
import { isLimitReached } from "../../types.js";
import type { MessageKey } from "../../i18n/types.js";
import { isBedrockModelId, getProviderLabel, getModelName, formatModelName } from "../../stdin.js";
import { critical, label, getQuotaColor, quotaBar, RESET } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";
import { progressLabel } from "./label-align.js";
import type { TimeFormatMode } from "../../config.js";
import { formatResetTime } from "../format-reset-time.js";
import { getDetectedProviderName } from "../../provider-usage.js";
import { formatUsageValue } from "../format-usage-value.js";

export function renderUsageLine(
  ctx: RenderContext,
  alignLabels = false,
): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;

  if (display?.showUsage === false) {
    return null;
  }

  if (!ctx.usageData) {
    return null;
  }

  if (isBedrockModelId(ctx.stdin.model?.id)) {
    return null;
  }

  const mode = display?.usageDisplayMode;

  if (mode === "table") {
    return renderUsageTable(ctx);
  }

  if (mode === "badge") {
    return renderUsageBadge(ctx);
  }

  // basic / compact fall through to legacy rendering below

  // ─── Upstream legacy rendering (fallback) ───────────────────────────────────

  const usageLabel = progressLabel("label.usage", colors, alignLabels);
  const timeFormat: TimeFormatMode = display?.timeFormat ?? 'relative';
  const showResetLabel = display?.showResetLabel ?? true;
  const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";
  const usageCompact = display?.usageCompact ?? false;

  if (isLimitReached(ctx.usageData)) {
    const resetTime =
      ctx.usageData.fiveHour === 100
        ? formatResetTime(ctx.usageData.fiveHourResetAt, timeFormat)
        : formatResetTime(ctx.usageData.sevenDayResetAt, timeFormat);
    if (usageCompact) {
      return critical(`⚠ Limit${resetTime ? ` (${resetTime})` : ""}`, colors);
    }
    const resetSuffix = resetTime
      ? showResetLabel
        ? ` (${t(resetsKey)} ${resetTime})`
        : ` (${resetTime})`
      : "";
    return `${usageLabel} ${critical(`⚠ ${t("status.limitReached")}${resetSuffix}`, colors)}`;
  }

  const threshold = display?.usageThreshold ?? 0;
  const fiveHour = ctx.usageData.fiveHour;
  const sevenDay = ctx.usageData.sevenDay;

  const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);
  if (effectiveUsage < threshold) {
    return null;
  }

  const sevenDayThreshold = display?.sevenDayThreshold ?? 80;

  if (usageCompact) {
    const fiveHourPart = fiveHour !== null
      ? formatCompactWindowPart("5h", fiveHour, ctx.usageData.fiveHourResetAt, timeFormat, colors)
      : null;
    const sevenDayPart = (sevenDay !== null && (fiveHour === null || sevenDay >= sevenDayThreshold))
      ? formatCompactWindowPart("7d", sevenDay, ctx.usageData.sevenDayResetAt, timeFormat, colors)
      : null;

    if (fiveHourPart && sevenDayPart) {
      return `${fiveHourPart} | ${sevenDayPart}`;
    }
    return fiveHourPart ?? sevenDayPart ?? null;
  }

  const usageBarEnabled = display?.usageBarEnabled ?? true;
  const barWidth = getAdaptiveBarWidth();

  if (fiveHour === null && sevenDay !== null) {
    const weeklyOnlyPart = formatUsageWindowPart({
      label: t("label.weekly"),
      labelKey: "label.weekly",
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      colors,
      usageBarEnabled,
      barWidth,
      timeFormat,
      showResetLabel,
      forceLabel: true,
      alignLabels,
    });
    return `${usageLabel} ${weeklyOnlyPart}`;
  }

  const fiveHourPart = formatUsageWindowPart({
    label: "5h",
    percent: fiveHour,
    resetAt: ctx.usageData.fiveHourResetAt,
    colors,
    usageBarEnabled,
    barWidth,
    timeFormat,
    showResetLabel,
  });

  if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
    const sevenDayPart = formatUsageWindowPart({
      label: t("label.weekly"),
      labelKey: "label.weekly",
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      colors,
      usageBarEnabled,
      barWidth,
      timeFormat,
      showResetLabel,
      forceLabel: true,
      alignLabels,
    });
    return `${usageLabel} ${fiveHourPart} | ${sevenDayPart}`;
  }

  return `${usageLabel} ${fiveHourPart}`;
}

// ─── Local helper functions for provider usage display ─────────────────────────

function formatResetTimePrecise(resetAt: Date | null): string {
  if (!resetAt) return "";
  const now = new Date();
  const diffMs = resetAt.getTime() - now.getTime();
  if (diffMs <= 0) return "";

  const diffMins = Math.ceil(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d${remHours}h`;
  }

  return `${hours}h${mins}m`;
}

function renderUsageTable(ctx: RenderContext): string {
  const provider = getProviderLabel(ctx.stdin) ?? getDetectedProviderName() ?? "";
  const model = formatModelName(
    getModelName(ctx.stdin),
    ctx.config?.display?.modelFormat,
    ctx.config?.display?.modelOverride,
  );

  const weekVal = formatUsageValue(
    ctx.usageData?.sevenDayUsed,
    ctx.usageData?.sevenDayLimit,
    ctx.usageData?.sevenDay,
  );
  const fiveHourVal = formatUsageValue(
    ctx.usageData?.fiveHourUsed,
    ctx.usageData?.fiveHourLimit,
    ctx.usageData?.fiveHour,
  );
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

  const header =
    `${cols.provider.label.padEnd(cols.provider.w)} ` +
    `${cols.model.label.padEnd(cols.model.w)} ` +
    `${cols.weekUsed.label.padEnd(cols.weekUsed.w)} ` +
    `${cols.weekReset.label.padEnd(cols.weekReset.w)} ` +
    `${cols.fiveHourUsed.label.padEnd(cols.fiveHourUsed.w)} ` +
    `${cols.fiveHourReset.label.padEnd(cols.fiveHourReset.w)}`;

  const sep =
    "".padEnd(cols.provider.w, "─") +
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

  const data =
    `${cols.provider.val.padEnd(cols.provider.w)} ` +
    `${cols.model.val.padEnd(cols.model.w)} ` +
    `${cols.weekUsed.val.padEnd(cols.weekUsed.w)} ` +
    `${cols.weekReset.val.padEnd(cols.weekReset.w)} ` +
    `${cols.fiveHourUsed.val.padEnd(cols.fiveHourUsed.w)} ` +
    `${cols.fiveHourReset.val.padEnd(cols.fiveHourReset.w)}`;

  return [header, sep, data].join("\n");
}

function visibleLength(str: string): number {
  // Strip ANSI escape sequences for visible width calculation
  // Covers SGR (\x1b[...m) and OSC (\x1b]8;;...\x1b\\) sequences.
  return str.replace(/(?:\x1b\[[0-9;]*m|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "").length;
}

function padEndVisible(str: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visibleLength(str));
  return str + " ".repeat(pad);
}

function renderUsageBadge(ctx: RenderContext): string {
  const colors = ctx.config?.colors;
  const provider = getProviderLabel(ctx.stdin) ?? getDetectedProviderName() ?? "";
  const model = formatModelName(
    getModelName(ctx.stdin),
    ctx.config?.display?.modelFormat,
    ctx.config?.display?.modelOverride,
  );
  const title = provider ? `${provider} · ${model}` : model;

  const barWidth = getAdaptiveBarWidth();
  const weekVal = formatUsageValue(
    ctx.usageData?.sevenDayUsed,
    ctx.usageData?.sevenDayLimit,
    ctx.usageData?.sevenDay,
  );
  const fiveHourVal = formatUsageValue(
    ctx.usageData?.fiveHourUsed,
    ctx.usageData?.fiveHourLimit,
    ctx.usageData?.fiveHour,
  );
  const weekReset = formatResetTimePrecise(ctx.usageData?.sevenDayResetAt ?? null);
  const fiveHourReset = formatResetTimePrecise(ctx.usageData?.fiveHourResetAt ?? null);

  const weekLine =
    ctx.usageData?.sevenDay !== null
      ? `W:  ${weekVal}${weekReset ? ` (${weekReset})` : ""}`
      : "";
  const fiveHourLine =
    ctx.usageData?.fiveHour !== null
      ? `5H: ${fiveHourVal}${fiveHourReset ? ` (${fiveHourReset})` : ""}`
      : "";

  const rawWeek = `W:  ${weekVal}${weekReset ? ` (${weekReset})` : ""}`;
  const rawFiveHour = `5H: ${fiveHourVal}${fiveHourReset ? ` (${fiveHourReset})` : ""}`;
  const innerWidth = Math.max(title.length, rawWeek.length, rawFiveHour.length);

  const top = "┌ " + title.padEnd(innerWidth) + " ┐";
  const mid1 = "│ " + padEndVisible(weekLine, innerWidth) + " │";
  const mid2 = "│ " + padEndVisible(fiveHourLine, innerWidth) + " │";
  const bottom = "└ " + "".padEnd(innerWidth, "─") + " ┘";

  return [top, mid1, mid2, bottom].join("\n");
}

// ─── Upstream helper functions ─────────────────────────────────────────────────

function formatCompactWindowPart(
  windowLabel: string,
  percent: number | null,
  resetAt: Date | null,
  timeFormat: TimeFormatMode,
  colors?: RenderContext["config"]["colors"],
): string {
  const usageDisplay = formatUsagePercent(percent, colors);
  const reset = formatResetTime(resetAt, timeFormat);
  const styledLabel = label(`${windowLabel}:`, colors);
  return reset
    ? `${styledLabel} ${usageDisplay} ${label(`(${reset})`, colors)}`
    : `${styledLabel} ${usageDisplay}`;
}

function formatUsagePercent(
  percent: number | null,
  colors?: RenderContext["config"]["colors"],
): string {
  if (percent === null) {
    return label("--", colors);
  }
  const color = getQuotaColor(percent, colors);
  return `${color}${percent}%${RESET}`;
}

function formatUsageWindowPart({
  label: windowLabel,
  labelKey,
  percent,
  resetAt,
  colors,
  usageBarEnabled,
  barWidth,
  timeFormat = 'relative',
  showResetLabel,
  forceLabel = false,
  alignLabels = false,
}: {
  label: string;
  labelKey?: MessageKey;
  percent: number | null;
  resetAt: Date | null;
  colors?: RenderContext["config"]["colors"];
  usageBarEnabled: boolean;
  barWidth: number;
  timeFormat?: TimeFormatMode;
  showResetLabel: boolean;
  forceLabel?: boolean;
  alignLabels?: boolean;
}): string {
  const usageDisplay = formatUsagePercent(percent, colors);
  const reset = formatResetTime(resetAt, timeFormat);
  const styledLabel = labelKey
    ? progressLabel(labelKey, colors, alignLabels)
    : label(windowLabel, colors);
  const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";

  const resetSuffix = reset
    ? showResetLabel
      ? `(${t(resetsKey)} ${reset})`
      : `(${reset})`
    : "";

  if (usageBarEnabled) {
    const body = resetSuffix
      ? `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay} ${resetSuffix}`
      : `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay}`;
    return forceLabel ? `${styledLabel} ${body}` : body;
  }

  return resetSuffix
    ? `${styledLabel} ${usageDisplay} ${resetSuffix}`
    : `${styledLabel} ${usageDisplay}`;
}
