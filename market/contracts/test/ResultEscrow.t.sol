// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ResultEscrow} from "../src/ResultEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract ResultEscrowTest is Test {
    MockUSDC usdc;
    ResultEscrow esc;
    address client = address(0xC1);
    address worker = address(0xB0B);
    address verifier = address(0x7E);
    address treasury = address(0xFEE);
    uint256 constant USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        esc = new ResultEscrow(address(usdc), treasury, 200, 500 * USDC); // 2% fee, $500 cap
        usdc.mint(client, 1000 * USDC);
        vm.prank(client);
        usdc.approve(address(esc), type(uint256).max);
    }

    function _job(address w) internal returns (uint256) {
        vm.prank(client); // 100 leads at $4 = $400
        return esc.createJob(w, verifier, 100, 4 * USDC, uint64(block.timestamp + 1 days), keccak256("spec"));
    }

    function test_createLocksBudget() public {
        _job(worker);
        assertEq(usdc.balanceOf(address(esc)), 400 * USDC);
        assertEq(usdc.balanceOf(client), 600 * USDC);
    }

    function test_partialSettlementPaysPerItemAndRefundsRest() public {
        uint256 id = _job(worker);
        vm.prank(worker);
        esc.submitResult(id, keccak256("file"));
        vm.prank(verifier);
        esc.settle(id, 73, keccak256("report"));
        // earned 73*4 = 292; fee 2% = 5.84; worker 286.16; refund 108
        assertEq(usdc.balanceOf(worker), 286_160_000);
        assertEq(usdc.balanceOf(treasury), 5_840_000);
        assertEq(usdc.balanceOf(client), 708 * USDC);
        assertEq(usdc.balanceOf(address(esc)), 0);
    }

    function test_verifiedCountIsCapped() public {
        uint256 id = _job(worker);
        vm.prank(worker);
        esc.submitResult(id, bytes32(0));
        vm.prank(verifier);
        esc.settle(id, 1000, bytes32(0));
        assertEq(usdc.balanceOf(worker), 392 * USDC);
        assertEq(usdc.balanceOf(address(esc)), 0);
    }

    function test_zeroVerifiedRefundsAll() public {
        uint256 id = _job(worker);
        vm.prank(worker);
        esc.submitResult(id, bytes32(0));
        vm.prank(verifier);
        esc.settle(id, 0, bytes32(0));
        assertEq(usdc.balanceOf(client), 1000 * USDC);
        assertEq(usdc.balanceOf(worker), 0);
    }

    function test_onlyVerifierCanSettle() public {
        uint256 id = _job(worker);
        vm.prank(worker);
        esc.submitResult(id, bytes32(0));
        vm.prank(worker);
        vm.expectRevert("not verifier");
        esc.settle(id, 100, bytes32(0));
    }

    function test_cannotSettleTwice() public {
        uint256 id = _job(worker);
        vm.prank(worker);
        esc.submitResult(id, bytes32(0));
        vm.startPrank(verifier);
        esc.settle(id, 10, bytes32(0));
        vm.expectRevert("not submitted");
        esc.settle(id, 10, bytes32(0));
        vm.stopPrank();
    }

    function test_wrongWorkerCannotSubmit() public {
        uint256 id = _job(worker);
        vm.prank(address(0xBAD));
        vm.expectRevert("not worker");
        esc.submitResult(id, bytes32(0));
    }

    function test_openJobFirstSubmitterBecomesWorker() public {
        uint256 id = _job(address(0));
        vm.prank(address(0xA11));
        esc.submitResult(id, bytes32(0));
        (, address w,,,,,,,) = esc.jobs(id);
        assertEq(w, address(0xA11));
    }

    function test_budgetCapBlocksBigJobs() public {
        vm.prank(client);
        vm.expectRevert("over budget cap");
        esc.createJob(worker, verifier, 200, 4 * USDC, uint64(block.timestamp + 1), bytes32(0));
    }

    function test_pauseBlocksNewJobs() public {
        esc.setConfig(200, treasury, 500 * USDC, true);
        vm.prank(client);
        vm.expectRevert("paused");
        esc.createJob(worker, verifier, 1, USDC, uint64(block.timestamp + 1), bytes32(0));
    }

    function test_refundAfterDeadline() public {
        uint256 id = _job(worker);
        vm.expectRevert("not expired");
        esc.refundExpired(id);
        vm.warp(block.timestamp + 2 days);
        esc.refundExpired(id);
        assertEq(usdc.balanceOf(client), 1000 * USDC);
        vm.prank(worker);
        vm.expectRevert("not open");
        esc.submitResult(id, bytes32(0));
    }

    function test_feeCappedAt10Percent() public {
        vm.expectRevert("fee too high");
        esc.setConfig(1001, treasury, 1, false);
    }

    function test_onlyOwnerConfigures() public {
        vm.prank(client);
        vm.expectRevert("not owner");
        esc.setConfig(0, client, 1, false);
    }

    /// Fuzz: money is always conserved, nothing stays stuck.
    function testFuzz_conservation(uint96 items, uint256 price, uint256 verified) public {
        items = uint96(bound(items, 1, 1000));
        price = bound(price, 1, 500 * USDC / items);
        vm.prank(client);
        uint256 id = esc.createJob(worker, verifier, items, price, uint64(block.timestamp + 1), bytes32(0));
        vm.prank(worker);
        esc.submitResult(id, bytes32(0));
        vm.prank(verifier);
        esc.settle(id, verified, bytes32(0));
        assertEq(usdc.balanceOf(address(esc)), 0);
        assertEq(usdc.balanceOf(client) + usdc.balanceOf(worker) + usdc.balanceOf(treasury), 1000 * USDC);
    }
}
