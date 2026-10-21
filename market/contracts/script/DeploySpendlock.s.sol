// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Spendlock} from "../src/Spendlock.sol";

/// Foundry alternative to agents/deploy-spendlock.js.
/// Env: USDC_ADDRESS (Base Sepolia USDC 0x036CbD53842c5426634e7929541eC2318f3dCF7e, or the local MockUSDC),
///      OWNER_ADDRESS (the vault owner; it must later call acceptOwnership only if ownership is transferred).
/// Local:        forge script script/DeploySpendlock.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key #0>
/// Base Sepolia: only after `node agents/checklist.js --spendlock` is all ✔ (keys stay in agents/.env, never in chat).
contract DeploySpendlock is Script {
    function run() external returns (Spendlock vault) {
        require(block.chainid != 8453, "unaudited: no Base mainnet");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        vm.startBroadcast();
        vault = new Spendlock(usdc, owner);
        vm.stopBroadcast();
        console.log("Spendlock:", address(vault));
        console.log("owner:", owner);
    }
}
