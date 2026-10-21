// Weeks run Monday 00:00 UTC -> next Monday 00:00 UTC. Key = ISO week, e.g. "2026-W43".
export function weekOf(ms = Date.now()) {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const end = start + 7 * 86400000;
  // ISO week number: the week that contains this week's Thursday.
  const thu = new Date(start + 3 * 86400000);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const n = Math.floor((thu.getTime() - jan1) / (7 * 86400000)) + 1;
  return { key: `${thu.getUTCFullYear()}-W${String(n).padStart(2, '0')}`, start, end };
}
