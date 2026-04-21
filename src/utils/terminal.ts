import { execSync } from 'node:child_process';

export const UNKNOWN_TERMINAL_WIDTH = 40;

function parseEnvColumns(): number | null {
  const envColumns = Number.parseInt(process.env.COLUMNS ?? '', 10);
  return Number.isFinite(envColumns) && envColumns > 0 ? envColumns : null;
}

function parseStreamColumns(columns: unknown): number | null {
  return typeof columns === 'number' && Number.isFinite(columns) && columns > 0
    ? Math.floor(columns)
    : null;
}

let ttyColumnsCache: { value: number | null; timestamp: number } | null = null;
const TTY_CACHE_TTL_MS = 5000;

function parseTtyColumns(): number | null {
  const now = Date.now();
  if (ttyColumnsCache && now - ttyColumnsCache.timestamp < TTY_CACHE_TTL_MS) {
    return ttyColumnsCache.value;
  }

  if (process.platform === 'win32') {
    try {
      const output = execSync('powershell -NoProfile -Command "[console]::WindowWidth"', {
        encoding: 'utf-8',
        timeout: 100,
      });
      const cols = Number.parseInt(output.trim(), 10);
      if (Number.isFinite(cols) && cols > 0) {
        ttyColumnsCache = { value: cols, timestamp: now };
        return cols;
      }
    } catch {
      // PowerShell unavailable or not in a console window
    }
  } else {
    try {
      const output = execSync('stty size < /dev/tty 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 50,
      });
      const parts = output.trim().split(/\s+/);
      if (parts.length >= 2) {
        const cols = Number.parseInt(parts[1]!, 10);
        if (Number.isFinite(cols) && cols > 0) {
          ttyColumnsCache = { value: cols, timestamp: now };
          return cols;
        }
      }
    } catch {
      // /dev/tty unavailable in non-TTY environments
    }
  }

  ttyColumnsCache = { value: null, timestamp: now };
  return null;
}

export function getTerminalWidth(options: { preferEnv?: boolean; fallback?: number | null } = {}): number | null {
  const { preferEnv = false, fallback = null } = options;

  if (preferEnv) {
    return parseEnvColumns()
      ?? parseStreamColumns(process.stdout?.columns)
      ?? parseStreamColumns(process.stderr?.columns)
      ?? parseTtyColumns()
      ?? fallback;
  }

  return parseStreamColumns(process.stdout?.columns)
    ?? parseStreamColumns(process.stderr?.columns)
    ?? parseEnvColumns()
    ?? parseTtyColumns()
    ?? fallback;
}

// Returns a progress bar width scaled to the current terminal width.
// Wide (>=100): 10, Medium (60-99): 6, Narrow (<60): 4.
export function getAdaptiveBarWidth(): number {
  const cols = getTerminalWidth({ preferEnv: true });

  if (cols !== null) {
    if (cols >= 100) return 10;
    if (cols >= 60) return 6;
    return 4;
  }
  return 10;
}
