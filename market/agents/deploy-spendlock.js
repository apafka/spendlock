// Deploys the Spendlock vault next to the existing MockUSDC/USDC + ResultEscrow.
//   NETWORK=local node deploy-spendlock.js          (after node deploy.js)
//   NETWORK=base-sepolia node deploy-spendlock.js   (only after: node checklist.js --spendlock  shows all ✔)
// The vault owner is the OWNER account (OWNER_ADDRESS / OWNER_PRIVATE_KEY on public networks).
import { NETWORK, publicClient, wallet, artifact, loadDeployment, saveDeployment, account } from './config.js';

if (NETWORK === 'base') throw new Error('Spendlock is unaudited: deploy to local or base-sepolia only.');
const dep = loadDeployment(); // needs usdc + escrow from deploy.js
const owner = process.env.OWNER_ADDRESS || account('OWNER').address;
const w = wallet('DEPLOYER');
const { abi, bytecode } = artifact('Spendlock');
const hash = await w.deployContract({ abi, bytecode, args: [dep.usdc, owner] });
const r = await publicClient.waitForTransactionReceipt({ hash });
saveDeployment({ ...dep, spendlock: r.contractAddress, spendlockOwner: owner });
console.log(`  deployed Spendlock at ${r.contractAddress} (owner ${owner}, token ${dep.usdc})`);
console.log(`Saved deployments/${NETWORK}.json`);
