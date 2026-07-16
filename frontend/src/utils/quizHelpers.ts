// ─── Quiz Helper Utilities ──────────────────────────────────────────────────

/**
 * Formats a total number of seconds into a "M:SS" string.
 */
export function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Groups an array of conversation objects into Today, Yesterday, and Older buckets
 * based on the `created_at` or `updated_at` field.
 */
export function groupConversations(items: any[]): {
  today: any[];
  yesterday: any[];
  older: any[];
} {
  const today: any[] = [];
  const yesterday: any[] = [];
  const older: any[] = [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  items.forEach((item) => {
    const itemDate = new Date(item.created_at || item.updated_at || Date.now());
    if (itemDate >= startOfToday) {
      today.push(item);
    } else if (itemDate >= startOfYesterday) {
      yesterday.push(item);
    } else {
      older.push(item);
    }
  });

  return { today, yesterday, older };
}
