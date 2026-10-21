// Tiny JSON store (one file per thing, atomic writes, a cross-process lock). Swap for SQLite when it grows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = process.env.GAME_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = (name) => path.join(DATA_DIR, name);
export function load(name, def) { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return def; } }
export function save(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file(`${name}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file(name));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Read-modify-write under a lock so the web app and the scoring job don't overwrite each other.
export async function update(name, def, fn) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lock = file(`${name}.lock`);
  const t0 = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() - t0 > 30000) { fs.rmSync(lock, { recursive: true, force: true }); continue; } // stale
      await sleep(30);
    }
  }
  try { const d = load(name, def); const out = await fn(d); save(name, d); return out; }
  finally { fs.rmSync(lock, { recursive: true, force: true }); }
}
// Files: pool.json (this week's draftable traders), league.json ({ players, weeks }).
export const loadPool = () => load('pool.json', null);
export const loadLeague = () => load('league.json', { players: {}, weeks: {} });
export const updateLeague = (fn) => update('league.json', { players: {}, weeks: {} }, fn);
