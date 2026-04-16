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
 * Fetch provider-based usage data.
 *
 * Detects the active coding plan provider from settings.json and fetches usage.
 * Uses file-based cache with 1-minute TTL. Returns stale cache on error.
 * Falls back gracefully if no provider is detected.
 */
export declare function fetchProviderUsage(): Promise<UsageData | null>;
/**
 * Get the detected provider name (for display purposes).
 */
export declare function getDetectedProviderName(): string | null;
//# sourceMappingURL=provider-usage.d.ts.map