// Deploys ResultEscrow (and MockUSDC on the local chain). Run: node deploy.js
import { NETWORK, NET, publicClient, wallet, artifact, saveDeployment, account } from './config.js';

const w = wallet('DEPLOYER');
async function deploy(name, args = []) {
  const { abi, bytecode } = artifact(name);
  const hash = await w.deployContract({ abi, bytecode, args });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  deployed ${name} at ${r.contractAddress}`);
  return r.contractAddress;
}

let usdc = NET.usdc;
if (!usdc) usdc = await deploy('MockUSDC');
const feeRecipient = process.env.FEE_RECIPIENT || account('DEPLOYER').address;
const feeBps = Number(process.env.FEE_BPS || 200); // 2%
const capUsdc = Number(process.env.MAX_JOB_BUDGET_USDC || (NETWORK === 'base' ? 20 : 500));
const escrow = await deploy('ResultEscrow', [usdc, feeRecipient, feeBps, BigInt(capUsdc * 1e6)]);
saveDeployment({ network: NETWORK, chainId: NET.chain.id, usdc, escrow, feeRecipient, feeBps, capUsdc });
console.log(`Saved deployments/${NETWORK}.json`);
