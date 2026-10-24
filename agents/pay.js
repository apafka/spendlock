// spendlockPay: call an x402 seller under an agent profile.
// 1. Request the URL.
// 2. If the seller replies 402, check the profile BEFORE paying
//    (seller allowlist/blocklist, per-tx cap, daily + lifetime budget, approval, kill switch).
// 3. If the quote is a machine-verifiable result (company-record/v1), run the
//    deterministic verifier BEFORE any USDC moves. Fail → rejected, not paid.
// 4. If allowed, pay from the team's vault (simulated, or local anvil / MockUSDC) and retry with X-PAYMENT.
// 5. Log every attempt on the team-wide log: paid, blocked + reason, waiting for approval, rejected.
import { checkPay, needsOwnerApproval } from './profiles.js';
import { encodePayment } from './mock-sellers.js';
import { COMPANY_RECORD_TYPE, verifyCompanyRecord } from './verify-company.js';

export async function httpRequest(url, { method = 'GET', headers = {}, body } = {}) {
  const payload = body == null
    ? undefined
    : typeof body === 'string'
      ? body
      : JSON.stringify(body);
  const res = await fetch(url, {
    method,
    headers: {
      ...(payload != null ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: payload,
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  const hdrs = {};
  res.headers.forEach((v, k) => {
    hdrs[k.toLowerCase()] = v;
  });
  return { status: res.status, headers: hdrs, body: parsed };
}

export function parseX402(body) {
  if (!body || body.x402Version !== 1 || !Array.isArray(body.accepts) || body.accepts.length === 0) {
    throw new Error('not an x402 payment requirement');
  }
  const accept = body.accepts.find((a) => a.scheme === 'exact') || body.accepts[0];
  const amountUSDC = accept.extra?.priceUSDC != null
    ? Number(accept.extra.priceUSDC)
    : Number(accept.maxAmountRequired) / 1e6;
  if (!Number.isFinite(amountUSDC) || amountUSDC < 0) throw new Error('bad x402 amount');
  return {
    accept,
    amountUSDC,
    payTo: accept.payTo,
    network: accept.network,
    quoteId: accept.extra?.quoteId,
    seller: accept.extra?.seller || accept.payTo || '',
    description: accept.description || '',
    resultType: accept.extra?.resultType || '',
    result: accept.extra?.result || null,
  };
}

export function isVerifiableResult(requirement) {
  return requirement?.resultType === COMPANY_RECORD_TYPE && requirement.result;
}

export async function verifyQuotedResult(requirement, { live = false } = {}) {
  if (!isVerifiableResult(requirement)) return null;
  return verifyCompanyRecord(requirement.result, { live });
}

function rejectedNotPaid(team, { agent, url, amountUSDC, requirement, memo, report }) {
  const reason = 'verification failed, not paid';
  const event = team.pushLog({
    agentId: agent?.id ?? null,
    agentName: agent?.name || 'agent',
    outcome: 'rejected',
    amountUSDC,
    sellerUrl: url,
    seller: sellerLabel(requirement, url),
    reason,
    memo,
  });
  return {
    outcome: 'rejected',
    verified: false,
    paid: false,
    reason,
    amountUSDC,
    report,
    requirement,
    event,
  };
}

async function payFromVault(team, agent, requirement, amountUSDC, memo) {
  if (team.mode === 'vault') {
    const { clients, keyToAccount, usdc, vaultAddress, abi } = await import('./lib.js');
    const raw = process.env[`SPENDLOCK_AGENT_KEY_${agent.id.toUpperCase()}`] || process.env.SPENDLOCK_AGENT_KEY;
    if (!raw) throw new Error(`Missing key for agent ${agent.id} (vault mode).`);
    const account = keyToAccount(raw);
    const { publicClient, walletClient } = await clients(account);
    if (!walletClient) throw new Error('Wallet client missing.');
    const hash = await walletClient.writeContract({
      address: vaultAddress(),
      abi,
      functionName: 'spend',
      args: [requirement.payTo, usdc(amountUSDC), memo || 'x402'],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const { decodeSpendReceipt } = await import('./lib.js');
    const onchain = decodeSpendReceipt(receipt, abi);
    if (onchain.outcome === 'rejected') {
      throw new Error(onchain.reason || 'vault rejected spend');
    }
    if (onchain.outcome === 'pending') {
      throw new Error('vault spend waiting for owner approval');
    }
    team.recordSpend(agent, amountUSDC);
    return { txHash: hash, simulated: false, onchain };
  }
  team.recordSpend(agent, amountUSDC);
  return { txHash: `sim-${requirement.quoteId || Date.now()}`, simulated: true };
}

function sellerLabel(requirement, url) {
  return requirement.seller || requirement.description || url;
}

async function settlePayment(team, { agent, url, method, body, requirement, amountUSDC, memo }) {
  const pay = await payFromVault(team, agent, requirement, amountUSDC, memo);
  const header = encodePayment({
    quoteId: requirement.quoteId,
    amountUSDC,
    agent: agent.id,
    txHash: pay.txHash,
    network: requirement.network,
  });
  const paid = await httpRequest(url, {
    method,
    body,
    headers: { 'X-PAYMENT': header },
  });
  const receipt = paid.headers['x-payment-response']
    ? JSON.parse(Buffer.from(paid.headers['x-payment-response'], 'base64').toString())
    : null;
  if (paid.status !== 200) {
    const reason = paid.body?.error || `seller HTTP ${paid.status}`;
    const event = team.pushLog({
      agentId: agent.id,
      agentName: agent.name,
      outcome: 'blocked',
      amountUSDC,
      sellerUrl: url,
      seller: sellerLabel(requirement, url),
      reason,
      memo,
    });
    return { outcome: 'blocked', reason, status: paid.status, body: paid.body, event, payment: pay };
  }
  const event = team.pushLog({
    agentId: agent.id,
    agentName: agent.name,
    outcome: 'paid',
    amountUSDC,
    sellerUrl: url,
    seller: sellerLabel(requirement, url),
    reason: 'within rules',
    memo,
  });
  return {
    outcome: 'paid',
    verified: isVerifiableResult(requirement) || undefined,
    paid: true,
    status: paid.status,
    data: paid.body,
    receipt,
    payment: pay,
    amountUSDC,
    event,
  };
}

async function verifyOrReject(team, { agent, url, amountUSDC, requirement, memo, live }) {
  if (!isVerifiableResult(requirement)) return { report: null, rejected: null };
  const report = await verifyQuotedResult(requirement, { live });
  if (report?.ok) return { report, rejected: null };
  return {
    report,
    rejected: rejectedNotPaid(team, { agent, url, amountUSDC, requirement, memo, report }),
  };
}

/** Make a request. On HTTP 402, enforce the agent profile, then pay and retry. */
export async function spendlockPay(team, { agent: agentId, url, method = 'GET', body, memo, live, requireVerify } = {}) {
  if (!agentId) throw new Error('agent is required');
  if (!url) throw new Error('url is required');
  const agent = team.findAgent(agentId);
  const note = memo || '';

  const first = await httpRequest(url, { method, body });
  if (first.status !== 402) {
    return {
      outcome: first.status >= 200 && first.status < 300 ? 'ok' : 'error',
      paid: false,
      status: first.status,
      data: first.body,
    };
  }

  let requirement;
  try {
    requirement = parseX402(first.body);
  } catch (e) {
    const event = team.pushLog({
      agentId: agent?.id ?? null,
      agentName: agent?.name || String(agentId),
      outcome: 'blocked',
      sellerUrl: url,
      reason: e.message,
      memo: note,
    });
    return { outcome: 'blocked', reason: e.message, event, status: 402 };
  }

  const amountUSDC = requirement.amountUSDC;
  const decision = team.decide(agentId, amountUSDC, url);
  const label = sellerLabel(requirement, url);

  if (decision.action === 'block') {
    const event = team.pushLog({
      agentId: decision.agent?.id ?? agent?.id ?? null,
      agentName: decision.agent?.name || agent?.name || String(agentId),
      outcome: 'blocked',
      amountUSDC,
      sellerUrl: url,
      seller: label,
      reason: decision.reason,
      memo: note,
    });
    return { outcome: 'blocked', reason: decision.reason, amountUSDC, requirement, event };
  }

  if (requireVerify && !isVerifiableResult(requirement)) {
    const event = team.pushLog({
      agentId: decision.agent?.id ?? agent?.id ?? null,
      agentName: decision.agent?.name || agent?.name || String(agentId),
      outcome: 'blocked',
      amountUSDC,
      sellerUrl: url,
      seller: label,
      reason: 'seller is not a verifiable result',
      memo: note,
    });
    return { outcome: 'blocked', reason: 'seller is not a verifiable result', amountUSDC, requirement, event };
  }

  if (decision.action === 'approve') {
    const item = team.enqueue({
      agent: decision.agent,
      url,
      method,
      body,
      amountUSDC,
      seller: label,
      requirement,
      memo: note,
      live: Boolean(live),
    });
    const event = team.pushLog({
      agentId: decision.agent.id,
      agentName: decision.agent.name,
      outcome: 'waiting',
      amountUSDC,
      sellerUrl: url,
      seller: label,
      reason: decision.reason,
      memo: note,
      requestId: item.id,
    });
    return {
      outcome: 'pending',
      requestId: item.id,
      reason: decision.reason,
      amountUSDC,
      requirement,
      event,
    };
  }

  const { report, rejected } = await verifyOrReject(team, {
    agent: decision.agent,
    url,
    amountUSDC,
    requirement,
    memo: note,
    live,
  });
  if (rejected) return rejected;

  const paid = await settlePayment(team, {
    agent: decision.agent,
    url,
    method,
    body,
    requirement,
    amountUSDC,
    memo: note,
  });
  if (report) {
    paid.verified = true;
    paid.report = report;
  }
  return paid;
}

/** Buy one machine-verifiable result. Payment releases only if the check passes. */
export async function spendlockBuyVerified(team, opts = {}) {
  return spendlockPay(team, { ...opts, requireVerify: true });
}

/** Owner approves a queued x402 payment: re-check every rule, then pay and retry. */
export async function approvePay(team, requestId, { reason } = {}) {
  const item = team.getRequest(requestId);
  if (!item || item.status !== 'pending') throw new Error(`request ${requestId} is not pending`);
  const agent = team.findAgent(item.agentId);
  const blocked = checkPay(team.snapshot(), agent, { amountUSDC: item.amountUSDC, sellerUrl: item.url });
  if (blocked) {
    team.markRequest(requestId, 'rejected');
    const event = team.pushLog({
      agentId: item.agentId,
      agentName: item.agentName,
      outcome: 'blocked',
      amountUSDC: item.amountUSDC,
      sellerUrl: item.url,
      seller: item.seller,
      reason: blocked,
      memo: item.memo,
      requestId,
    });
    return { outcome: 'blocked', reason: blocked, event, requestId };
  }
  // Fresh 402 so the quote is still valid after the owner looked at it.
  const first = await httpRequest(item.url, { method: item.method, body: item.body });
  if (first.status !== 402) {
    team.markRequest(requestId, 'rejected');
    const reasonText = `seller did not re-quote (HTTP ${first.status})`;
    const event = team.pushLog({
      agentId: item.agentId,
      agentName: item.agentName,
      outcome: 'blocked',
      amountUSDC: item.amountUSDC,
      sellerUrl: item.url,
      seller: item.seller,
      reason: reasonText,
      memo: item.memo,
      requestId,
    });
    return { outcome: 'blocked', reason: reasonText, event, requestId };
  }
  const requirement = parseX402(first.body);
  if (requirement.amountUSDC > item.amountUSDC + 1e-9) {
    team.markRequest(requestId, 'rejected');
    const reasonText = 'price increased';
    const event = team.pushLog({
      agentId: item.agentId,
      agentName: item.agentName,
      outcome: 'blocked',
      amountUSDC: requirement.amountUSDC,
      sellerUrl: item.url,
      seller: item.seller,
      reason: reasonText,
      memo: item.memo,
      requestId,
    });
    return { outcome: 'blocked', reason: reasonText, event, requestId };
  }
  team.markRequest(requestId, 'approved');
  team.pushLog({
    agentId: item.agentId,
    agentName: item.agentName,
    outcome: 'approved',
    amountUSDC: requirement.amountUSDC,
    sellerUrl: item.url,
    seller: item.seller,
    reason: reason || 'owner approved',
    memo: item.memo,
    requestId,
  });
  const { report, rejected } = await verifyOrReject(team, {
    agent,
    url: item.url,
    amountUSDC: requirement.amountUSDC,
    requirement,
    memo: item.memo,
    live: item.live,
  });
  if (rejected) return { ...rejected, requestId };
  const paid = await settlePayment(team, {
    agent,
    url: item.url,
    method: item.method,
    body: item.body,
    requirement,
    amountUSDC: requirement.amountUSDC,
    memo: item.memo,
  });
  if (report) {
    paid.verified = true;
    paid.report = report;
  }
  return paid;
}

export function rejectPay(team, requestId, reason = 'rejected by owner') {
  const item = team.getRequest(requestId);
  if (!item || item.status !== 'pending') throw new Error(`request ${requestId} is not pending`);
  team.markRequest(requestId, 'rejected');
  const event = team.pushLog({
    agentId: item.agentId,
    agentName: item.agentName,
    outcome: 'blocked',
    amountUSDC: item.amountUSDC,
    sellerUrl: item.url,
    seller: item.seller,
    reason,
    memo: item.memo,
    requestId,
  });
  return { outcome: 'blocked', reason, event, requestId };
}

export { checkPay, needsOwnerApproval };
