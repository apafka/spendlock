import fs from 'node:fs';
import path from 'node:path';
import { keccak256, toBytes } from 'viem';
import { ROOT, NETWORK } from './config.js';

// Off-chain files live here. On-chain we only store their keccak256 hash,
// so anyone can prove the file was not changed afterwards.
// Every file is keyed by its on-chain job id (<id>.spec/result/report.json); there is no shared "latest".
export const jobsDir = process.env.JOBS_DIR || path.join(ROOT, 'agents', 'data', 'jobs');
fs.mkdirSync(jobsDir, { recursive: true });
export const hashFile = (file) => keccak256(toBytes(fs.readFileSync(file, 'utf8')));
export const jobFile = (id, kind) => path.join(jobsDir, `${id}.${kind}.json`);
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
export const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
export const STATUS = ['None', 'Open', 'Submitted', 'Settled', 'Refunded'];

// Worker and verifier act on ONE job, named explicitly.
export function jobIdArg() {
  const v = arg('job');
  if (!/^\d+$/.test(String(v))) throw new Error('Pass --job <id> (the id post-job.js printed). There is no shared "latest" job any more.');
  return BigInt(v);
}

// Cross-process lock per signing account. Two buys running at once share the CLIENT/WORKER/VERIFIER
// keys, so without this they would grab the same nonce, or overwrite each other's USDC allowance.
// Only the short on-chain step is locked; feed, pre-check and checking still run in parallel.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function withLock(name, fn, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const dir = path.join(jobsDir, '.locks', `${NETWORK}-${name}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const t0 = Date.now();
  for (;;) {
    try { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'pid'), String(process.pid)); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = NaN; try { pid = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')); } catch {}
      let alive = true; if (pid) { try { process.kill(pid, 0); } catch (k) { alive = k.code === 'EPERM'; } }
      if (pid && !alive) { fs.rmSync(dir, { recursive: true, force: true }); continue; } // owner died: stale lock
      if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for lock ${name}`);
      await sleep(50 + Math.random() * 100);
    }
  }
  try { return await fn(); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
