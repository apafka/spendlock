// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Spendlock} from "../src/Spendlock.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ResultEscrow} from "../src/ResultEscrow.sol";

/// @notice Local / Base Sepolia deploy only. Mainnet chain ids are refused.
contract Deploy is Script {
    error MainnetDisabled(uint256 chainId);

    function run() external {
        if (_isMainnet(block.chainid)) revert MainnetDisabled(block.chainid);

        address owner = msg.sender;
        vm.startBroadcast();

        address token;
        if (block.chainid == 84532) {
            // Base Sepolia USDC (Circle test mint). Do not use this path on mainnet.
            token = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        } else {
            MockUSDC usdc = new MockUSDC();
            token = address(usdc);
            usdc.mint(owner, 1_000_000 * 1e6);
        }

        Spendlock vault = new Spendlock(token, owner);
        ResultEscrow escrow = new ResultEscrow(token, owner, 200, 500 * 1e6);

        vm.stopBroadcast();

        console.log("chain", block.chainid);
        console.log("token", token);
        console.log("spendlock", address(vault));
        console.log("escrow", address(escrow));
        console.log("owner", owner);
    }

    function _isMainnet(uint256 id) internal pure returns (bool) {
        return id == 1 || id == 8453 || id == 10 || id == 42161 || id == 137 || id == 56;
    }
}
