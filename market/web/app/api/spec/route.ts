// Saves the job spec (criteria) next to the agents so the worker/verifier can read it.
// On-chain we only store its hash. (Later: put it on IPFS or a real DB.)
import fs from 'node:fs';
import path from 'node:path';

export async function POST(req: Request) {
  const { jobId, specText } = await req.json();
  if (!/^\d+$/.test(String(jobId))) return Response.json({ error: 'bad jobId' }, { status: 400 });
  const dir = path.resolve(process.cwd(), '..', 'agents', 'data', 'jobs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${jobId}.spec.json`), specText); // exact bytes, so the hash matches
  return Response.json({ ok: true });
}
