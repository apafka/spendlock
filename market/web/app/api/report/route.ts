// Returns the verifier's report for a job (every item, pass/fail, reason).  GET /api/report?id=1
import fs from 'node:fs';
import path from 'node:path';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d+$/.test(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  const f = path.resolve(process.cwd(), '..', 'agents', 'data', 'jobs', `${id}.report.json`);
  if (!fs.existsSync(f)) return Response.json({ error: 'No report yet (job not verified).' }, { status: 404 });
  return Response.json(JSON.parse(fs.readFileSync(f, 'utf8')));
}
