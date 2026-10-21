// Salary cap: each trader costs 5..15 credits based on last-30-day performance. Players get 50 for 5 picks,
// so the five best traders (~70+ credits) never fit together. You have to find value.
export const CAP = 50, TEAM_SIZE = 5, MIN_SALARY = 5, MAX_SALARY = 15;
const pct = (arr, v) => (arr.length <= 1 ? 0.5 : arr.filter((x) => x < v).length / (arr.length - 1));
export function assignSalaries(traders) {
  const rois = traders.map((t) => t.monthRoi), pnls = traders.map((t) => t.monthPnl);
  return traders.map((t) => {
    const s = 0.6 * pct(rois, t.monthRoi) + 0.4 * pct(pnls, t.monthPnl);
    return { ...t, salary: MIN_SALARY + Math.round(s * (MAX_SALARY - MIN_SALARY)) };
  });
}
export function validateTeam(picks, pool) {
  const byAddr = new Map(pool.map((t) => [t.address, t]));
  const set = new Set(picks.map((p) => String(p).toLowerCase()));
  if (picks.length !== TEAM_SIZE || set.size !== TEAM_SIZE) return { ok: false, error: `Pick exactly ${TEAM_SIZE} different traders.` };
  const chosen = [...set].map((a) => byAddr.get(a));
  if (chosen.some((t) => !t)) return { ok: false, error: 'A pick is not in this week\'s pool.' };
  const salary = chosen.reduce((s, t) => s + t.salary, 0);
  if (salary > CAP) return { ok: false, error: `Team costs ${salary}, cap is ${CAP}.` };
  return { ok: true, salary, picks: [...set] };
}
