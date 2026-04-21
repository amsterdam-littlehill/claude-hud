export function formatUsageValue(
  used?: number | null,
  limit?: number | null,
  percent?: number | null,
): string {
  if (typeof used === "number" && typeof limit === "number") {
    return `${used}/${limit}`;
  }
  if (typeof percent === "number") {
    return `${percent}%`;
  }
  return "--";
}
