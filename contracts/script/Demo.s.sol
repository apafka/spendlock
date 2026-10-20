// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Spendlock} from "../src/Spendlock.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ResultEscrow} from "../src/ResultEscrow.sol";

/// @notice One-shot local walkthrough of the vault rules. Play money only.
/// Run: see ../demo-spendlock.sh (anvil + this script). Refuses mainnet.
contract Demo is Script {
    uint256 constant USDC = 1e6;
    error MainnetDisabled(uint256 chainId);

    function run() external {
        if (block.chainid == 1 || block.chainid == 8453) revert MainnetDisabled(block.chainid);

        address owner = msg.sender;
        address agentA = address(0xA11CE);
        address agentB = address(0xB0B);
        address dataFeed = address(0xa7A1);
        address stranger = address(0xBAD);

        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC();
        Spendlock vault = new Spendlock(address(usdc), owner);
        ResultEscrow escrow = new ResultEscrow(address(usdc), owner, 200, 500 * USDC);
        usdc.mint(owner, 1000 * USDC);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(100 * USDC);

        vault.setPolicy(agentA, uint128(20 * USDC), uint128(20 * USDC), uint128(60 * USDC), uint128(15 * USDC), 0);
        vault.setAllowed(agentA, address(escrow), true);

        vault.setPolicy(agentB, uint128(10 * USDC), uint128(20 * USDC), uint128(40 * USDC), uint128(5 * USDC), 0);
        vault.setAllowed(agentB, dataFeed, true);
        vm.stopBroadcast();

        console.log("vault", address(vault));
        console.log("escrow", address(escrow));
        console.log("funded $100");

        vm.prank(agentB);
        (Spendlock.Result r1,) = vault.spend(dataFeed, 4 * USDC, "market data, 1 day");
        console.log("Agent B $4 data feed ->", uint8(r1), "(0=executed 1=pending 2=rejected)");

        vm.prank(agentB);
        (Spendlock.Result r2,) = vault.spend(dataFeed, 12 * USDC, "over per-tx cap");
        console.log("Agent B $12 (over $10 cap) ->", uint8(r2));

        vm.prank(agentA);
        (Spendlock.Result r3,) = vault.spend(stranger, 3 * USDC, "tip a stranger");
        console.log("Agent A $3 stranger ->", uint8(r3));

        vm.prank(agentB);
        (Spendlock.Result r4, uint256 id) = vault.spend(dataFeed, 8 * USDC, "premium data feed");
        console.log("Agent B $8 (above $5 threshold) ->", uint8(r4), "request", id);

        vm.prank(owner);
        vault.setKill(true);
        vm.prank(agentA);
        (Spendlock.Result r5,) = vault.spend(address(escrow), 1 * USDC, "tiny call");
        console.log("Kill switch on, Agent A $1 ->", uint8(r5));

        console.log("vault balance", vault.balance() / USDC);
        console.log("pending request", vault.requestCount());
    }
}
