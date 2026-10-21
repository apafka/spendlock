// Show USDC balances of every role.  node balances.js
import { publicClient, account, artifact, loadDeployment, fromUnits } from './config.js';
const dep = loadDeployment();
const abi = artifact('MockUSDC').abi;
const who = { CLIENT: account('CLIENT').address, ...(process.env.NETWORK === 'local' || !process.env.NETWORK ? { X402_BUYER: account('BUYER').address } : {}), WORKER: account('WORKER').address, FEE_RECIPIENT: dep.feeRecipient, ESCROW: dep.escrow };
for (const [k, a] of Object.entries(who)) {
  const b = await publicClient.readContract({ address: dep.usdc, abi, functionName: 'balanceOf', args: [a] });
  console.log(`  ${k.padEnd(14)} ${a}  $${fromUnits(b)}`);
}
