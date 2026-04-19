import { readStdin, getUsageFromStdin } from "./stdin.js";
import { parseTranscript } from "./transcript.js";
import { render } from "./render/index.js";
import { countConfigs } from "./config-reader.js";
import { getGitStatus } from "./git.js";
import { loadConfig } from "./config.js";
import { parseExtraCmdArg, runExtraCmd } from "./extra-cmd.js";
import { getClaudeCodeVersion } from "./version.js";
import { getMemoryUsage } from "./memory.js";
import { setLanguage, t } from "./i18n/index.js";
import { fetchProviderUsage } from "./provider-usage.js";
import type { RenderContext } from "./types.js";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export type MainDeps = {
  readStdin: typeof readStdin;
  getUsageFromStdin: typeof getUsageFromStdin;
  parseTranscript: typeof parseTranscript;
  countConfigs: typeof countConfigs;
  getGitStatus: typeof getGitStatus;
  loadConfig: typeof loadConfig;
  parseExtraCmdArg: typeof parseExtraCmdArg;
  runExtraCmd: typeof runExtraCmd;
  getClaudeCodeVersion: typeof getClaudeCodeVersion;
  getMemoryUsage: typeof getMemoryUsage;
  render: typeof render;
  now: () => number;
  log: (...args: unknown[]) => void;
};

export async function main(overrides: Partial<MainDeps> = {}): Promise<void> {
  const deps: MainDeps = {
    readStdin,
    getUsageFromStdin,
    parseTranscript,
    countConfigs,
    getGitStatus,
    loadConfig,
    parseExtraCmdArg,
    runExtraCmd,
    getClaudeCodeVersion,
    getMemoryUsage,
    render,
    now: () => Date.now(),
    log: console.log,
    ...overrides,
  };

  try {
    // Phase 1: load config + read stdin in parallel (independent I/O)
    const [config, stdin] = await Promise.all([
      deps.loadConfig(),
      deps.readStdin(),
    ]);

    setLanguage(config.language);

    if (!stdin) {
      // Running without stdin - this happens during setup verification
      const isMacOS = process.platform === "darwin";
      deps.log(t("init.initializing"));
      if (isMacOS) {
        deps.log(t("init.macosNote"));
      }
      return;
    }

    const transcriptPath = stdin.transcript_path ?? "";

    // Phase 2: all independent data sources fetched in parallel
    const providerUsagePromise = (async (): Promise<RenderContext["usageData"]> => {
      if (config.display.showUsage === false) return null;
      const fromStdin = deps.getUsageFromStdin(stdin);
      if (fromStdin) return fromStdin;
      try {
        return await fetchProviderUsage();
      } catch {
        return null;
      }
    })();

    const extraCmd = deps.parseExtraCmdArg();
    const extraLabelPromise = extraCmd
      ? deps.runExtraCmd(extraCmd)
      : Promise.resolve(null);

    const [
      transcript,
      configCounts,
      gitStatus,
      usageData,
      claudeCodeVersion,
      memoryUsage,
      extraLabel,
    ] = await Promise.all([
      deps.parseTranscript(transcriptPath),
      deps.countConfigs(stdin.cwd),
      config.gitStatus.enabled
        ? deps.getGitStatus(stdin.cwd)
        : Promise.resolve(null),
      providerUsagePromise,
      config.display.showClaudeCodeVersion
        ? deps.getClaudeCodeVersion()
        : Promise.resolve(undefined),
      config.display.showMemoryUsage && config.lineLayout === "expanded"
        ? deps.getMemoryUsage()
        : Promise.resolve(null),
      extraLabelPromise,
    ]);

    const { claudeMdCount, rulesCount, mcpCount, hooksCount, outputStyle } = configCounts;

    const sessionDuration = formatSessionDuration(
      transcript.sessionStart,
      deps.now,
    );

    const ctx: RenderContext = {
      stdin,
      transcript,
      claudeMdCount,
      rulesCount,
      mcpCount,
      hooksCount,
      sessionDuration,
      gitStatus,
      usageData,
      memoryUsage,
      config,
      extraLabel,
      outputStyle,
      claudeCodeVersion,
    };

    deps.render(ctx);
  } catch (error) {
    deps.log(
      "[claude-hud] Error:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export function formatSessionDuration(
  sessionStart?: Date,
  now: () => number = () => Date.now(),
): string {
  if (!sessionStart) {
    return "";
  }

  const ms = now() - sessionStart.getTime();
  const mins = Math.floor(ms / 60000);

  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
  void main();
}
