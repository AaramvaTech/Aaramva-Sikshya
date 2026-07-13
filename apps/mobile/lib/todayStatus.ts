export function todayAttendanceStatus(
  recentHistory: { dateAd: string; status: string }[],
  todayAd: string,
): string | null {
  return recentHistory.find((h) => h.dateAd === todayAd)?.status ?? null;
}
