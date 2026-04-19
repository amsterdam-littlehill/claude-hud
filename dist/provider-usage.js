/**
 * Provider-based coding plan usage fetching with multi-tier API resilience.
 *
 * Resilience layers:
 *   1. Negative cache (30s) — prevents error storms
 *   2. File-based exclusive lock — prevents stampede from concurrent processes
 *   3. Fresh cache check — returns cached data if within TTL
 *   4. API fetch with AbortController timeout
 *   5. 429 retry-after handling (1 retry if <=10s)
 *   6. Stale cache fallback (up to 1 hour old)
 *   7. Atomic cache writes (temp file + rename, 0o600 permissions)
 *
 * Architecture:
 *   - Provider interface: extensible, add new providers by implementing CodingPlanProvider
 *   - Auto-detection: reads ANTHROPIC_BASE_URL from settings.json to identify the provider
 *   - Cache: file-based cache with configurable TTL
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// ─── Cache Configuration ───────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000; // 1 minute — fresh cache lifetime
const NEGATIVE_CACHE_TTL_MS = 30_000; // 30s — suppress retries after errors
const STALE_CACHE_MAX_AGE_MS = 3_600_000; // 1 hour — stale cache fallback
const LOCK_TIMEOUT_MS = 10_000; // 10s — max wait for exclusive lock
const API_TIMEOUT_MS = 15_000; // 15s — API request timeout
const LOCK_POLL_INTERVAL_MS = 50; // 50ms — lock polling interval
function getCacheDir() {
    return path.join(os.homedir(), '.claude', 'plugins', 'claude-hud');
}
function getCachePath(provider) {
    return path.join(getCacheDir(), `provider-usage-${provider}.json`);
}
function getLockPath(provider) {
    return path.join(getCacheDir(), `provider-usage-${provider}.lock`);
}
function writeFileAtomic(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, data, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
}
function readCache(provider) {
    const cachePath = getCachePath(provider);
    if (!fs.existsSync(cachePath))
        return null;
    try {
        const raw = fs.readFileSync(cachePath, 'utf-8');
        const parsed = JSON.parse(raw);
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
    const entry = {
        fetchedAt: Date.now(),
        provider,
        data,
        error,
    };
    try {
        writeFileAtomic(getCachePath(provider), JSON.stringify(entry));
    }
    catch {
        // ignore write errors
    }
}
// ─── Exclusive Lock (Stampede Prevention) ──────────────────────────────────────
function acquireLock(lockPath, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, String(process.pid));
            fs.closeSync(fd);
            return true;
        }
        catch (err) {
            if (err.code === 'EEXIST') {
                try {
                    const pidStr = fs.readFileSync(lockPath, 'utf-8').trim();
                    const pid = Number.parseInt(pidStr, 10);
                    if (!Number.isNaN(pid) && pid !== process.pid) {
                        try {
                            process.kill(pid, 0);
                        }
                        catch {
                            try {
                                fs.unlinkSync(lockPath);
                            }
                            catch { /* ignore */ }
                            continue;
                        }
                    }
                }
                catch {
                    // can't read lock file
                }
                const remaining = timeoutMs - (Date.now() - start);
                if (remaining > 0) {
                    const wait = Math.min(LOCK_POLL_INTERVAL_MS, remaining);
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
                }
            }
            else {
                return false;
            }
        }
    }
    return false;
}
function releaseLock(lockPath) {
    try {
        fs.unlinkSync(lockPath);
    }
    catch {
        // ignore
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        try {
            const res = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            if (!res.ok) {
                if (res.status === 429) {
                    const retryAfter = res.headers.get('retry-after');
                    const retrySeconds = retryAfter ? Number.parseInt(retryAfter, 10) : 0;
                    if (retrySeconds > 0 && retrySeconds <= 10) {
                        clearTimeout(timeoutId);
                        await new Promise(r => setTimeout(r, retrySeconds * 1000));
                        const controller2 = new AbortController();
                        const timeoutId2 = setTimeout(() => controller2.abort(), API_TIMEOUT_MS);
                        try {
                            const retryRes = await fetch(endpoint, {
                                method: 'GET',
                                headers: {
                                    Authorization: `Bearer ${apiKey}`,
                                    Accept: 'application/json',
                                },
                                signal: controller2.signal,
                            });
                            clearTimeout(timeoutId2);
                            if (retryRes.ok) {
                                return parseKimiResponse(await retryRes.json());
                            }
                            const text = await retryRes.text().catch(() => '');
                            throw new Error(`Kimi API error ${retryRes.status}: ${text || retryRes.statusText}`);
                        }
                        finally {
                            clearTimeout(timeoutId2);
                        }
                    }
                }
                const text = await res.text().catch(() => '');
                throw new Error(`Kimi API error ${res.status}: ${text || res.statusText}`);
            }
            return parseKimiResponse(await res.json());
        }
        finally {
            clearTimeout(timeoutId);
        }
    },
};
function parseKimiResponse(json) {
    const windows = [];
    const usageItem = Array.isArray(json.usages)
        ? json.usages.find((u) => u.scope === 'FEATURE_CODING') ?? json.usages[0]
        : null;
    const totalDetail = usageItem?.detail ?? json.usage;
    const windowLimits = usageItem?.limits ?? json.limits;
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
}
const glmProvider = {
    name: 'glm',
    async fetchUsage(apiKey, _baseUrl) {
        const endpoint = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        try {
            const res = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    Authorization: apiKey,
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            if (!res.ok) {
                if (res.status === 429) {
                    const retryAfter = res.headers.get('retry-after');
                    const retrySeconds = retryAfter ? Number.parseInt(retryAfter, 10) : 0;
                    if (retrySeconds > 0 && retrySeconds <= 10) {
                        clearTimeout(timeoutId);
                        await new Promise(r => setTimeout(r, retrySeconds * 1000));
                        const controller2 = new AbortController();
                        const timeoutId2 = setTimeout(() => controller2.abort(), API_TIMEOUT_MS);
                        try {
                            const retryRes = await fetch(endpoint, {
                                method: 'GET',
                                headers: {
                                    Authorization: apiKey,
                                    Accept: 'application/json',
                                },
                                signal: controller2.signal,
                            });
                            clearTimeout(timeoutId2);
                            if (retryRes.ok) {
                                return parseGlmResponse(await retryRes.json());
                            }
                            const text = await retryRes.text().catch(() => '');
                            throw new Error(`GLM API error ${retryRes.status}: ${text || retryRes.statusText}`);
                        }
                        finally {
                            clearTimeout(timeoutId2);
                        }
                    }
                }
                const text = await res.text().catch(() => '');
                throw new Error(`GLM API error ${res.status}: ${text || res.statusText}`);
            }
            return parseGlmResponse(await res.json());
        }
        finally {
            clearTimeout(timeoutId);
        }
    },
};
function parseGlmResponse(json) {
    if (!json.success) {
        throw new Error(`GLM API error: ${json.msg || 'unknown'}`);
    }
    const windows = [];
    let totalPercent = null;
    let totalLimit = null;
    let totalRemaining = null;
    let totalResetAt = null;
    const limits = json.data?.limits ?? [];
    let tokensIndex = 0;
    for (const limit of limits) {
        if (limit.type === 'TOKENS_LIMIT') {
            const limitVal = limit.usage;
            const remaining = limit.remaining;
            const percent = Math.min(100, Math.round(limit.percentage));
            const resetAt = limit.nextResetTime > 0 ? new Date(limit.nextResetTime) : null;
            if (tokensIndex === 0) {
                windows.push({
                    label: '5h',
                    percent,
                    remaining,
                    limit: limitVal,
                    resetAt,
                });
                totalPercent = percent;
                totalLimit = limitVal;
                totalRemaining = remaining;
                totalResetAt = resetAt;
            }
            else if (tokensIndex === 1) {
                windows.push({
                    label: '7d',
                    percent,
                    remaining,
                    limit: limitVal,
                    resetAt,
                });
            }
            tokensIndex++;
        }
        else if (limit.type === 'TIME_LIMIT') {
            const limitVal = limit.usage;
            const current = limit.currentValue;
            const remaining = limit.remaining;
            const percent = limitVal > 0 ? Math.min(100, Math.round((current / limitVal) * 100)) : 0;
            windows.push({
                label: 'mcp',
                percent,
                remaining,
                limit: limitVal,
                resetAt: limit.nextResetTime > 0 ? new Date(limit.nextResetTime) : null,
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
}
// ─── Provider Registry ─────────────────────────────────────────────────────────
const providers = new Map();
function registerProvider(provider) {
    providers.set(provider.name, provider);
}
registerProvider(kimiProvider);
registerProvider(glmProvider);
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
        if (baseUrl.includes('kimi.com')) {
            return { name: 'kimi', apiKey: token, baseUrl };
        }
        if (baseUrl.includes('bigmodel.cn')) {
            return { name: 'glm', apiKey: token, baseUrl };
        }
        return null;
    }
    catch {
        return null;
    }
}
// ─── Cache Status ──────────────────────────────────────────────────────────────
function getCacheStatus(cached) {
    if (!cached)
        return { fresh: false, stale: false, negative: false };
    const age = Date.now() - cached.fetchedAt;
    const isNegative = !!cached.error;
    if (isNegative) {
        return { fresh: age < NEGATIVE_CACHE_TTL_MS, stale: false, negative: true };
    }
    return {
        fresh: age < CACHE_TTL_MS,
        stale: age >= CACHE_TTL_MS && age < STALE_CACHE_MAX_AGE_MS,
        negative: false,
    };
}
// ─── Public API ────────────────────────────────────────────────────────────────
/**
 * Fetch provider-based usage data with multi-tier resilience.
 *
 * Resilience chain:
 *   1. Check negative cache (suppress retries after errors)
 *   2. Acquire exclusive file lock (prevent stampede)
 *   3. Check fresh cache
 *   4. Fetch from API with timeout
 *   5. Handle 429 with retry-after
 *   6. Write cache atomically (temp + rename, 0o600)
 *   7. Fall back to stale cache on any error
 *   8. Release lock
 */
export async function fetchProviderUsage() {
    const detected = detectProviderFromSettings();
    if (!detected)
        return null;
    const provider = providers.get(detected.name);
    if (!provider)
        return null;
    const lockPath = getLockPath(detected.name);
    // Step 1: Check cache before locking
    const cached = readCache(detected.name);
    const cacheStatus = getCacheStatus(cached);
    // Negative cache: suppress retries for 30s after errors
    if (cacheStatus.negative && cacheStatus.fresh) {
        return null;
    }
    // Fresh cache: return immediately
    if (cacheStatus.fresh && cached?.data) {
        return mapToUsageData(cached.data);
    }
    // Stale cache: return it now, refresh in background
    if (cacheStatus.stale && cached?.data) {
        refreshInBackground(provider, detected.apiKey, detected.baseUrl);
        return mapToUsageData(cached.data);
    }
    // Step 2: Acquire exclusive lock
    const lockAcquired = acquireLock(lockPath, LOCK_TIMEOUT_MS);
    if (!lockAcquired) {
        if (cached?.data) {
            return mapToUsageData(cached.data);
        }
        return null;
    }
    try {
        // Double-check cache after acquiring lock
        const lockedCached = readCache(detected.name);
        const lockedStatus = getCacheStatus(lockedCached);
        if (lockedStatus.fresh && lockedCached?.data) {
            return mapToUsageData(lockedCached.data);
        }
        // Fetch from API
        try {
            const data = await provider.fetchUsage(detected.apiKey, detected.baseUrl);
            writeCache(detected.name, data);
            return data ? mapToUsageData(data) : null;
        }
        catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            writeCache(detected.name, null, err);
            // Fall back to stale cache (up to 1 hour)
            if (lockedCached?.data) {
                const age = Date.now() - lockedCached.fetchedAt;
                if (age < STALE_CACHE_MAX_AGE_MS) {
                    return mapToUsageData(lockedCached.data);
                }
            }
            return null;
        }
    }
    finally {
        releaseLock(lockPath);
    }
}
function refreshInBackground(provider, apiKey, baseUrl) {
    const detected = detectProviderFromSettings();
    if (!detected)
        return;
    const lockPath = getLockPath(detected.name);
    const lockAcquired = acquireLock(lockPath, 0);
    if (!lockAcquired)
        return;
    provider.fetchUsage(apiKey, baseUrl)
        .then((data) => writeCache(provider.name, data))
        .catch((e) => {
        const err = e instanceof Error ? e.message : String(e);
        writeCache(provider.name, null, err);
    })
        .finally(() => {
        releaseLock(lockPath);
    });
}
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
            if (sevenDay === null || w.percent > sevenDay) {
                sevenDay = w.percent;
                sevenDayResetAt = w.resetAt;
                sevenDayUsed = used;
                sevenDayLimit = w.limit;
            }
        }
        else if (labelLower.includes('h') || labelLower.includes('m')) {
            if (fiveHour === null || w.percent > fiveHour) {
                fiveHour = w.percent;
                fiveHourResetAt = w.resetAt;
                fiveHourUsed = used;
                fiveHourLimit = w.limit;
            }
        }
    }
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
export function getDetectedProviderName() {
    const detected = detectProviderFromSettings();
    return detected?.name ?? null;
}
//# sourceMappingURL=provider-usage.js.map