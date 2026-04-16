/**
 * Provider-based coding plan usage fetching.
 *
 * When Claude Code's stdin rate_limits are unavailable (e.g. third-party providers),
 * this module detects the active provider from settings.json and fetches usage
 * directly from the provider's API.
 *
 * Architecture:
 *   - Provider interface: extensible, add new providers by implementing CodingPlanProvider
 *   - Auto-detection: reads ANTHROPIC_BASE_URL from settings.json to identify the provider
 *   - Cache: file-based cache with configurable TTL to avoid hitting APIs too often
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
function getCacheDir() {
    return path.join(os.homedir(), '.claude', 'plugins', 'claude-hud');
}
function getCachePath(provider) {
    return path.join(getCacheDir(), `provider-usage-${provider}.json`);
}
function readCache(provider, ttlMs) {
    const cachePath = getCachePath(provider);
    if (!fs.existsSync(cachePath))
        return null;
    try {
        const raw = fs.readFileSync(cachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Revive dates
        if (parsed.data) {
            if (parsed.data.totalResetAt && typeof parsed.data.totalResetAt === 'string') {
                parsed.data.totalResetAt = new Date(parsed.data.totalResetAt);
            }
            for (const w of parsed.data.windows) {
                if (w.resetAt && typeof w.resetAt === 'string') {
                    w.resetAt = new Date(w.resetAt);
                }
            }
        }
        const now = Date.now();
        if (now - parsed.fetchedAt < ttlMs && !parsed.error) {
            return parsed;
        }
        // Return stale cache if available (will trigger background refresh)
        return parsed;
    }
    catch {
        return null;
    }
}
function writeCache(provider, data, error) {
    const cacheDir = getCacheDir();
    if (!fs.existsSync(cacheDir)) {
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        catch {
            return;
        }
    }
    const cachePath = getCachePath(provider);
    const entry = {
        fetchedAt: Date.now(),
        provider,
        data,
        error,
    };
    try {
        fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf-8');
    }
    catch {
        // ignore write errors
    }
}
// ─── Kimi Provider ─────────────────────────────────────────────────────────────
function getKimiUsageEndpoint(baseUrl) {
    const normalized = baseUrl.replace(/\/$/, '');
    return normalized.endsWith('/coding') ? '/v1/usages' : '/coding/v1/usages';
}
function parseStringNumber(value) {
    if (!value)
        return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
function formatWindowLabel(duration, timeUnit) {
    if (timeUnit === 'TIME_UNIT_MINUTE') {
        if (duration >= 60 && duration % 60 === 0) {
            const hours = duration / 60;
            return hours === 24 ? '1d' : `${hours}h`;
        }
        return `${duration}m`;
    }
    if (timeUnit === 'TIME_UNIT_HOUR') {
        return duration === 24 ? '1d' : `${duration}h`;
    }
    if (timeUnit === 'TIME_UNIT_DAY') {
        return `${duration}d`;
    }
    return `${duration}`;
}
const kimiProvider = {
    name: 'kimi',
    async fetchUsage(apiKey, baseUrl) {
        const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
        const endpoint = `${normalizedBaseUrl}${getKimiUsageEndpoint(normalizedBaseUrl)}`;
        const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
            },
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Kimi API error ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json());
        const windows = [];
        // Prefer new `usages` array format; fall back to legacy `usage`/`limits`
        const usageItem = Array.isArray(json.usages)
            ? json.usages.find((u) => u.scope === 'FEATURE_CODING') ?? json.usages[0]
            : null;
        const totalDetail = usageItem?.detail ?? json.usage;
        const windowLimits = usageItem?.limits ?? json.limits;
        // Parse top-level usage
        let totalPercent = null;
        let totalLimit = null;
        let totalRemaining = null;
        let totalResetAt = null;
        if (totalDetail) {
            const limit = parseStringNumber(totalDetail.limit);
            const remaining = parseStringNumber(totalDetail.remaining);
            const usedRaw = parseStringNumber(totalDetail.used);
            const used = totalDetail.used !== undefined && totalDetail.used !== ''
                ? usedRaw
                : Math.max(0, limit - remaining);
            totalPercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            totalLimit = limit;
            totalRemaining = remaining;
            totalResetAt = totalDetail.resetTime ? new Date(totalDetail.resetTime) : null;
        }
        // Parse windowed limits
        if (Array.isArray(windowLimits)) {
            for (const item of windowLimits) {
                const detail = item.detail;
                const limit = parseStringNumber(detail.limit);
                const remaining = parseStringNumber(detail.remaining);
                const usedRaw = parseStringNumber(detail.used);
                const used = detail.used !== undefined && detail.used !== ''
                    ? usedRaw
                    : Math.max(0, limit - remaining);
                windows.push({
                    label: formatWindowLabel(item.window.duration, item.window.timeUnit),
                    percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
                    remaining,
                    limit,
                    resetAt: detail.resetTime ? new Date(detail.resetTime) : null,
                });
            }
        }
        return {
            totalPercent,
            totalLimit,
            totalRemaining,
            totalResetAt,
            windows,
        };
    },
};
// ─── Provider Registry ─────────────────────────────────────────────────────────
const providers = new Map();
function registerProvider(provider) {
    providers.set(provider.name, provider);
}
// Register built-in providers
registerProvider(kimiProvider);
function detectProviderFromSettings() {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath))
        return null;
    try {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const baseUrl = parsed.env?.ANTHROPIC_BASE_URL;
        const token = parsed.env?.ANTHROPIC_AUTH_TOKEN;
        if (!baseUrl || !token)
            return null;
        // Detect Kimi
        if (baseUrl.includes('kimi.com')) {
            return { name: 'kimi', apiKey: token, baseUrl };
        }
        // Future: add more provider detections here
        // if (baseUrl.includes('minimaxi.com')) return { name: 'minimax', apiKey: token, baseUrl };
        // if (baseUrl.includes('right.codes')) return { name: 'rightcode', apiKey: token, baseUrl };
        return null;
    }
    catch {
        return null;
    }
}
// ─── Public API ────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000; // 1 minute
/**
 * Fetch provider-based usage data.
 *
 * Detects the active coding plan provider from settings.json and fetches usage.
 * Uses file-based cache with 1-minute TTL. Returns stale cache on error.
 * Falls back gracefully if no provider is detected.
 */
export async function fetchProviderUsage() {
    const detected = detectProviderFromSettings();
    if (!detected)
        return null;
    const provider = providers.get(detected.name);
    if (!provider)
        return null;
    // Try cache first
    const cached = readCache(detected.name, CACHE_TTL_MS);
    if (cached && !cached.error && cached.data) {
        // If cache is still fresh, return it
        const now = Date.now();
        if (now - cached.fetchedAt < CACHE_TTL_MS) {
            return mapToUsageData(cached.data);
        }
        // Stale but valid — return it and refresh in background
        refreshInBackground(provider, detected.apiKey, detected.baseUrl);
        return mapToUsageData(cached.data);
    }
    // No valid cache — fetch fresh
    try {
        const data = await provider.fetchUsage(detected.apiKey, detected.baseUrl);
        writeCache(detected.name, data);
        return data ? mapToUsageData(data) : null;
    }
    catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        writeCache(detected.name, null, err);
        // Return stale cache if available
        if (cached?.data) {
            return mapToUsageData(cached.data);
        }
        return null;
    }
}
function refreshInBackground(provider, apiKey, baseUrl) {
    // Non-blocking background refresh — Node.js keeps the process alive
    provider.fetchUsage(apiKey, baseUrl)
        .then((data) => writeCache(provider.name, data))
        .catch((e) => {
        const err = e instanceof Error ? e.message : String(e);
        writeCache(provider.name, null, err);
    });
}
/**
 * Map ProviderUsageData to the HUD's UsageData format.
 *
 * Maps window labels to fiveHour/sevenDay:
 *   - Labels containing "d" → sevenDay window
 *   - Labels containing "h" or "m" → fiveHour window
 *   - Falls back to totalPercent if no windows match
 */
function mapToUsageData(data) {
    let fiveHour = null;
    let sevenDay = null;
    let fiveHourResetAt = null;
    let sevenDayResetAt = null;
    let fiveHourUsed = null;
    let fiveHourLimit = null;
    let sevenDayUsed = null;
    let sevenDayLimit = null;
    for (const w of data.windows) {
        const labelLower = w.label.toLowerCase();
        const used = w.limit - w.remaining;
        if (labelLower.includes('d')) {
            // Day-based window → sevenDay
            if (sevenDay === null || w.percent > sevenDay) {
                sevenDay = w.percent;
                sevenDayResetAt = w.resetAt;
                sevenDayUsed = used;
                sevenDayLimit = w.limit;
            }
        }
        else if (labelLower.includes('h') || labelLower.includes('m')) {
            // Hour/minute-based window → fiveHour
            if (fiveHour === null || w.percent > fiveHour) {
                fiveHour = w.percent;
                fiveHourResetAt = w.resetAt;
                fiveHourUsed = used;
                fiveHourLimit = w.limit;
            }
        }
    }
    // Fallback: if no day-based window matched, use totalPercent for sevenDay
    if (sevenDay === null && data.totalPercent !== null) {
        sevenDay = data.totalPercent;
        sevenDayResetAt = data.totalResetAt;
        if (data.totalLimit !== null && data.totalRemaining !== null) {
            sevenDayUsed = data.totalLimit - data.totalRemaining;
            sevenDayLimit = data.totalLimit;
        }
    }
    if (fiveHour === null && sevenDay === null) {
        return null;
    }
    return {
        fiveHour,
        sevenDay,
        fiveHourResetAt,
        sevenDayResetAt,
        fiveHourUsed,
        fiveHourLimit,
        sevenDayUsed,
        sevenDayLimit,
    };
}
/**
 * Get the detected provider name (for display purposes).
 */
export function getDetectedProviderName() {
    const detected = detectProviderFromSettings();
    return detected?.name ?? null;
}
//# sourceMappingURL=provider-usage.js.map