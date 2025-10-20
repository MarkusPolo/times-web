// src/app/api/_utils/rate.ts
// Simple In-Memory Rate Limit (pro Key).
const buckets = new Map<string, { ts: number; count: number }>();
const WINDOW_MS = 60_000; // 1 Minute
const MAX = 30;           // 30 req / min / key

export function rateLimit(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.ts > WINDOW_MS) {
    buckets.set(key, { ts: now, count: 1 });
    return { ok: true, remaining: MAX - 1 };
  }
  b.count += 1;
  if (b.count > MAX) return { ok: false, remaining: 0 };
  return { ok: true, remaining: MAX - b.count };
}
