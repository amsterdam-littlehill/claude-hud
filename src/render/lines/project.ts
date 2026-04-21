import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RenderContext } from '../../types.js';
import { getModelName, formatModelName, getProviderLabel } from '../../stdin.js';
import { getOutputSpeed } from '../../speed-tracker.js';
import { git as gitColor, gitBranch as gitBranchColor, warning as warningColor, critical as criticalColor, label, model as modelColor, project as projectColor, red, green, yellow, dim, custom as customColor } from '../colors.js';
import { t } from '../../i18n/index.js';
import { renderCostEstimate } from './cost.js';
import { getDetectedProviderName } from '../../provider-usage.js';
import { formatResetTime } from '../format-reset-time.js';
import { formatUsageValue } from '../format-usage-value.js';

function formatCompactProvider(provider: string): string {
  if (!provider) return '';
  const map: Record<string, string> = {
    anthropic: 'Ant',
    openai: 'OA',
    google: 'Goo',
    kimi: 'Kim',
    glm: 'GLM',
  };
  const normalized = provider.toLowerCase();
  return map[normalized] || provider.slice(0, 3);
}

function formatCompactModelName(model: string): string {
  if (!model) return '';
  const short = formatModelName(model, 'short');
  const words = short.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words[0]! + words.slice(1).join('');
  }
  return short;
}

function hyperlink(uri: string, text: string): string {
  const esc = '\x1b';
  const st = '\\';
  return `${esc}]8;;${uri}${esc}${st}${text}${esc}]8;;${esc}${st}`;
}

export function renderProjectLine(ctx: RenderContext, terminalWidth: number | null = null): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;
  const headerParts: string[] = [];
  const metaParts: string[] = [];

  if (display?.showModel !== false) {
    const model = formatModelName(getModelName(ctx.stdin), ctx.config?.display?.modelFormat, ctx.config?.display?.modelOverride);
    const providerLabel = getProviderLabel(ctx.stdin) ?? getDetectedProviderName() ?? undefined;
    const usageMode = display?.usageDisplayMode ?? 'compact';

    let modelDisplay: string;

    if (usageMode === 'compact' && providerLabel && ctx.usageData) {
      const compactProvider = formatCompactProvider(providerLabel);
      const compactModel = formatCompactModelName(model);
      modelDisplay = modelColor(`${compactProvider}:${compactModel}`, colors);
    } else {
      modelDisplay = modelColor(`[${model}]`, colors);
      if (providerLabel) {
        modelDisplay = modelColor(`[${providerLabel}]`, colors) + modelDisplay;
      }
    }

    let usagePart: string | null = null;

    if (display?.showUsage !== false && ctx.usageData) {
      if (usageMode === 'basic') {
        const weekVal = formatUsageValue(ctx.usageData.sevenDayUsed, ctx.usageData.sevenDayLimit, ctx.usageData.sevenDay);
        const fiveHourVal = formatUsageValue(ctx.usageData.fiveHourUsed, ctx.usageData.fiveHourLimit, ctx.usageData.fiveHour);
        const timeFormat = display?.timeFormat ?? 'relative';
        const weekReset = formatResetTime(ctx.usageData.sevenDayResetAt ?? null, timeFormat);
        const fiveHourReset = formatResetTime(ctx.usageData.fiveHourResetAt ?? null, timeFormat);
        const weekPart = weekVal !== '--' ? label(`[${weekVal}${weekReset ? `(${weekReset})` : ''}]`, colors) : '';
        const fiveHourPart = fiveHourVal !== '--' ? label(`[${fiveHourVal}${fiveHourReset ? `(${fiveHourReset})` : ''}]`, colors) : '';
        if (weekPart || fiveHourPart) {
          modelDisplay += label('-', colors) + weekPart + fiveHourPart;
        }
      } else if (usageMode === 'compact') {
        const threshold = display?.usageThreshold ?? 0;
        const sevenDayThreshold = display?.sevenDayThreshold ?? 80;
        const fiveHour = ctx.usageData.fiveHour;
        const sevenDay = ctx.usageData.sevenDay;
        const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);

        if (effectiveUsage >= threshold) {
          const timeFormat = display?.timeFormat ?? 'relative';
          const weekReset = formatResetTime(ctx.usageData.sevenDayResetAt ?? null, timeFormat);
          const fiveHourReset = formatResetTime(ctx.usageData.fiveHourResetAt ?? null, timeFormat);
          // On narrow terminals skip reset times to keep the line compact
          const showReset = terminalWidth === null || terminalWidth >= 100;
          const usageParts: string[] = [];
          if (fiveHour !== null) {
            const fiveHourVal = formatUsageValue(ctx.usageData.fiveHourUsed, ctx.usageData.fiveHourLimit, fiveHour);
            const part = `5H: ${fiveHourVal}`;
            usageParts.push(showReset && fiveHourReset ? `${part} (${fiveHourReset})` : part);
          }
          if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
            const weekVal = formatUsageValue(ctx.usageData.sevenDayUsed, ctx.usageData.sevenDayLimit, sevenDay);
            const part = `W: ${weekVal}`;
            usageParts.push(showReset && weekReset ? `${part} (${weekReset})` : part);
          }
          if (usageParts.length > 0) {
            usagePart = usageParts.join(' ');
          }
        }
      }
    }

    headerParts.push(modelDisplay);
    if (usagePart) {
      headerParts.push(usagePart);
    }
  }

  let projectPart: string | null = null;
  if (display?.showProject !== false && ctx.stdin.cwd) {
    const segments = ctx.stdin.cwd.split(/[/\\]/).filter(Boolean);
    const pathLevels = ctx.config?.pathLevels ?? 1;
    const projectPath = segments.length > 0 ? segments.slice(-pathLevels).join('/') : '/';
    const coloredProject = projectColor(projectPath, colors);
    projectPart = hyperlink(`file://${ctx.stdin.cwd}`, coloredProject);
  }

  let gitPart = '';
  const gitConfig = ctx.config?.gitStatus;
  const showGit = gitConfig?.enabled ?? true;
  const branchOverflow = gitConfig?.branchOverflow ?? 'truncate';

  if (showGit && ctx.gitStatus) {
    const branchText = ctx.gitStatus.branch + ((gitConfig?.showDirty ?? true) && ctx.gitStatus.isDirty ? '*' : '');
    const coloredBranch = gitBranchColor(branchText, colors);
    const linkedBranch = ctx.gitStatus.branchUrl ? hyperlink(ctx.gitStatus.branchUrl, coloredBranch) : coloredBranch;
    const gitInner: string[] = [linkedBranch];

    if (gitConfig?.showAheadBehind) {
      if (ctx.gitStatus.ahead > 0) {
        gitInner.push(formatAheadCount(ctx.gitStatus.ahead, gitConfig, colors));
      }
      if (ctx.gitStatus.behind > 0) gitInner.push(gitBranchColor(`↓${ctx.gitStatus.behind}`, colors));
    }

    if (gitConfig?.showFileStats && ctx.gitStatus.lineDiff) {
      const { added, deleted } = ctx.gitStatus.lineDiff;
      const diffParts: string[] = [];
      if (added > 0) diffParts.push(green(`+${added}`));
      if (deleted > 0) diffParts.push(red(`-${deleted}`));
      if (diffParts.length > 0) {
        gitInner.push(`[${diffParts.join(' ')}]`);
      }
    }

    gitPart = `${gitColor('git:(', colors)}${gitInner.join(' ')}${gitColor(')', colors)}`;
  }

  if (projectPart && gitPart) {
    if (branchOverflow === 'wrap') {
      metaParts.push(projectPart);
      metaParts.push(gitPart);
    } else {
      metaParts.push(`${projectPart} ${gitPart}`);
    }
  } else if (projectPart) {
    metaParts.push(projectPart);
  } else if (gitPart) {
    metaParts.push(gitPart);
  }

  if (display?.showSessionName && ctx.transcript.sessionName) {
    metaParts.push(label(ctx.transcript.sessionName, colors));
  }

  if (display?.showClaudeCodeVersion && ctx.claudeCodeVersion) {
    metaParts.push(label(`CC v${ctx.claudeCodeVersion}`, colors));
  }

  if (ctx.extraLabel) {
    metaParts.push(label(ctx.extraLabel, colors));
  }

  if (display?.showSpeed) {
    const speed = getOutputSpeed(ctx.stdin);
    if (speed !== null) {
      metaParts.push(label(`${t('format.out')}: ${speed.toFixed(1)} ${t('format.tokPerSec')}`, colors));
    }
  }

  if (display?.showDuration !== false && ctx.sessionDuration) {
    metaParts.push(label(`⏱️  ${ctx.sessionDuration}`, colors));
  }

  const costEstimate = renderCostEstimate(ctx);
  if (costEstimate) {
    metaParts.push(costEstimate);
  }

  const customLine = display?.customLine;
  if (customLine) {
    metaParts.push(customColor(customLine, colors));
  }

  const headerLine = headerParts.length > 0 ? headerParts.join(' \u2502 ') : null;
  const metaLine = metaParts.length > 0 ? metaParts.join(' \u2502 ') : null;

  if (headerLine && metaLine) {
    return `${headerLine}\n${metaLine}`;
  }
  return headerLine ?? metaLine ?? null;
}

function formatAheadCount(
  ahead: number,
  gitConfig: RenderContext['config']['gitStatus'] | undefined,
  colors: RenderContext['config']['colors'] | undefined,
): string {
  const value = `↑${ahead}`;
  const criticalThreshold = gitConfig?.pushCriticalThreshold ?? 0;
  const warningThreshold = gitConfig?.pushWarningThreshold ?? 0;

  if (criticalThreshold > 0 && ahead >= criticalThreshold) {
    return criticalColor(value, colors);
  }

  if (warningThreshold > 0 && ahead >= warningThreshold) {
    return warningColor(value, colors);
  }

  return gitBranchColor(value, colors);
}

export function renderGitFilesLine(ctx: RenderContext, terminalWidth: number | null = null): string | null {
  const gitConfig = ctx.config?.gitStatus;
  if (!(gitConfig?.showFileStats ?? false)) return null;
  if (!ctx.gitStatus?.fileStats) return null;

  const { trackedFiles, untracked } = ctx.gitStatus.fileStats;
  if (trackedFiles.length === 0 && untracked === 0) return null;
  if (terminalWidth !== null && terminalWidth < 60) return null;

  const cwd = ctx.stdin.cwd;
  const sorted = [...trackedFiles].sort((a, b) => {
    try {
      const aMtime = cwd ? fs.statSync(path.join(cwd, a.fullPath)).mtimeMs : 0;
      const bMtime = cwd ? fs.statSync(path.join(cwd, b.fullPath)).mtimeMs : 0;
      return bMtime - aMtime;
    } catch {
      return 0;
    }
  });

  const shown = sorted.slice(0, 6);
  const overflow = sorted.length - shown.length;
  const statParts: string[] = [];

  for (const trackedFile of shown) {
    const prefix = trackedFile.type === 'added' ? green('+') : trackedFile.type === 'deleted' ? red('-') : yellow('~');
    const coloredName = trackedFile.type === 'added'
      ? green(trackedFile.basename)
      : trackedFile.type === 'deleted'
        ? red(trackedFile.basename)
        : yellow(trackedFile.basename);
    const linkedName = cwd ? hyperlink(`file://${path.join(cwd, trackedFile.fullPath)}`, coloredName) : coloredName;
    let entry = `${prefix}${linkedName}`;

    if (trackedFile.lineDiff) {
      const diffParts: string[] = [];
      if (trackedFile.lineDiff.added > 0) diffParts.push(green(`+${trackedFile.lineDiff.added}`));
      if (trackedFile.lineDiff.deleted > 0) diffParts.push(red(`-${trackedFile.lineDiff.deleted}`));
      if (diffParts.length > 0) {
        entry += dim(`(${diffParts.join(' ')})`);
      }
    }

    statParts.push(entry);
  }

  if (overflow > 0) statParts.push(dim(`+${overflow} more`));
  if (untracked > 0) statParts.push(dim(`?${untracked}`));

  return statParts.join('  ');
}
