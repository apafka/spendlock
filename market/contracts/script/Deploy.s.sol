// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ResultEscrow} from "../src/ResultEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Usage (env vars): USDC_ADDRESS (empty = deploy MockUSDC), FEE_RECIPIENT, FEE_BPS, MAX_JOB_BUDGET_USDC
contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(200)));
        uint256 cap = vm.envOr("MAX_JOB_BUDGET_USDC", uint256(50)) * 1e6;
        vm.startBroadcast();
        if (usdc == address(0)) {
            usdc = address(new MockUSDC());
            console.log("MockUSDC:", usdc);
        }
        ResultEscrow esc = new ResultEscrow(usdc, feeRecipient, feeBps, cap);
        console.log("ResultEscrow:", address(esc));
        vm.stopBroadcast();
    }
}
