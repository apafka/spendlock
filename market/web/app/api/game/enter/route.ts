// POST /api/game/enter {player, picks[5], wallet?, signature?} -> saves a team for this week.
// Wallet is optional; if given, the signature must prove the player controls it (no keys ever reach the server).
// @ts-nocheck
import { verifyMessage } from 'viem';
import { loadPool, updateLeague } from '../../../../../game/lib/store.js';
import { ensureWeek, addEntry } from '../../../../../game/lib/league.js';
import { weekOf } from '../../../../../game/lib/week.js';
import { signText } from '../../../game/sign';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const pool = loadPool();
  if (!pool) return Response.json({ error: 'No pool yet.' }, { status: 503 });
  let wallet = null;
  if (body.wallet) {
    const ok = /^0x[0-9a-fA-F]{40}$/.test(body.wallet) && body.signature &&
      (await verifyMessage({ address: body.wallet, message: signText(body.player, weekOf().key), signature: body.signature }).catch(() => false));
    if (!ok) return Response.json({ error: 'Wallet signature did not verify.' }, { status: 400 });
    wallet = body.wallet;
  }
  const r = await updateLeague(async (league) => {
    const w = await ensureWeek(league, pool);
    return addEntry(league, pool, w, { player: String(body.player || ''), wallet, picks: Array.isArray(body.picks) ? body.picks : [] });
  });
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({ ok: true, player: r.entry.player, salary: r.entry.salary, share: `/game/p/${encodeURIComponent(r.entry.player)}` });
}
