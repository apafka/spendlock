// GET /api/game/leaderboard -> current week's ranked teams.
import { board } from '../../../game/data';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { week, rows } = board();
  return Response.json({ week: week ? { key: week.key, start: week.start, end: week.end, updatedAt: week.latest?.takenAt, baseline: week.baseline?.mode } : null, rows });
}
