// GET /api/game/pool -> this week's draftable traders with salaries and stats.
import { poolWithStats, CAP, TEAM_SIZE } from '../../../game/data';
export const dynamic = 'force-dynamic';
export async function GET() {
  const p = poolWithStats();
  if (!p) return Response.json({ error: 'No pool yet. Run: cd game && node scripts/build-pool.js' }, { status: 404 });
  return Response.json({ ...p, cap: CAP, teamSize: TEAM_SIZE });
}
