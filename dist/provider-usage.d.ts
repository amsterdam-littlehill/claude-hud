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
import type { UsageData } from './types.js';
export interface CodingPlanProvider {
    /** Unique provider identifier (e.g. "kimi") */
    name: string;
    /** Fetch usage data from the provider's API */
    fetchUsage(apiKey: string, baseUrl: string): Promise<ProviderUsageData | null>;
}
export interface ProviderUsageData {
    /** Overall usage percentage (0-100) */
    totalPercent: number | null;
    /** Total limit */
    totalLimit: number | null;
    /** Total remaining */
    totalRemaining: number | null;
    /** Total reset time */
    totalResetAt: Date | null;
    /** Windowed rate limits */
    windows: ProviderWindow[];
}
export interface ProviderWindow {
    /** Human-readable label (e.g. "5h", "7d") */
    label: string;
    /** Usage percentage (0-100) */
    percent: number;
    /** Remaining quota */
    remaining: number;
    /** Total quota */
    limit: number;
    /** Reset time */
    resetAt: Date | null;
}
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
export declare function fetchProviderUsage(): Promise<UsageData | null>;
export declare function getDetectedProviderName(): string | null;
/** Test-only entrypoint to invalidate the provider name cache. */
export declare function _invalidateProviderNameCache(): void;
//# sourceMappingURL=provider-usage.d.ts.map