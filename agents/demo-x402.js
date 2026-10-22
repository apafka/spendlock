#!/usr/bin/env node
// One agent, three x402 sellers, one budget — plus an approval-required agent and a kill switch.
// Simulated play money. No wallet, no mainnet.
import { createTeam } from './profiles.js';
import { startMockSellers } from './mock-sellers.js';
import { approvePay, spendlockPay } from './pay.js';

export async function runDemo({ log = console.log } = {}) {
  const show = (label, r) => {
    const bits = [r.outcome];
    if (r.amountUSDC != null) bits.push(`$${r.amountUSDC}`);
    if (r.reason) bits.push(r.reason);
    if (r.requestId != null) bits.push(`request #${r.requestId}`);
    if (r.data) bits.push(JSON.stringify(r.data));
    log(`${label.padEnd(28)} ${bits.join(' · ')}`);
  };
  const team = createTeam({ seed: true, mode: 'simulated' });
  const pack = await startMockSellers();
  const feed = pack.byId['price-feed'];
  const company = pack.byId['company-data'];
  const dataset = pack.byId['dataset'];
  try {
    log('Sellers');
    for (const s of pack.sellers) log(`  ${s.name}  $${s.priceUSDC}  ${s.url}`);
    log('');
    log('Scout (auto-approve under $50, $5 per-tx cap) buys from all three under one budget:');
    const r1 = await spendlockPay(team, { agent: 'scout', url: feed.url, memo: 'price tick' });
    show('  price feed $0.02', r1);
    const r2 = await spendlockPay(team, { agent: 'scout', url: company.url, memo: 'company snapshot' });
    show('  company data $0.50', r2);
    const r3 = await spendlockPay(team, { agent: 'scout', url: dataset.url, memo: 'full dataset' });
    show('  expensive dataset $25', r3);

    log('');
    log('Ops (approve every purchase) buys the $0.50 company snapshot:');
    const r4 = await spendlockPay(team, { agent: 'ops', url: company.url, memo: 'ops lookup' });
    show('  waiting for owner', r4);
    const r5 = await approvePay(team, r4.requestId);
    show('  owner approved', r5);

    log('');
    log('Kill switch freezes both agents:');
    team.setKill(true);
    const r6 = await spendlockPay(team, { agent: 'scout', url: feed.url, memo: 'after kill' });
    show('  scout after kill', r6);
    const r7 = await spendlockPay(team, { agent: 'ops', url: feed.url, memo: 'after kill' });
    show('  ops after kill', r7);

    log('');
    log('Team-wide log:');
    for (const e of team.log()) {
      const amt = e.amountUSDC == null ? '' : `$${e.amountUSDC} `;
      log(`  ${e.outcome.padEnd(10)} ${e.agentName.padEnd(8)} ${amt}${e.seller || ''} ${e.reason}`);
    }

    return { team, results: { r1, r2, r3, r4, r5, r6, r7 }, sellers: pack.byId };
  } finally {
    await pack.close();
  }
}

const main = process.argv[1] && new URL(import.meta.url).pathname === decodeURIComponent(new URL(`file://${process.argv[1]}`).pathname);
if (main) {
  const { results } = await runDemo();
  const ok =
    results.r1.outcome === 'paid' &&
    results.r2.outcome === 'paid' &&
    results.r3.outcome === 'blocked' &&
    results.r3.reason === 'over per-tx cap' &&
    results.r4.outcome === 'pending' &&
    results.r5.outcome === 'paid' &&
    results.r6.outcome === 'blocked' &&
    results.r7.outcome === 'blocked';
  if (!ok) {
    console.error('demo outcomes did not match the expected story');
    process.exit(1);
  }
}
