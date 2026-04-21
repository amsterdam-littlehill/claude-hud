export function formatUsageValue(used, limit, percent) {
    if (typeof used === "number" && typeof limit === "number") {
        return `${used}/${limit}`;
    }
    if (typeof percent === "number") {
        return `${percent}%`;
    }
    return "--";
}
//# sourceMappingURL=format-usage-value.js.map