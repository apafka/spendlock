// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Spendlock} from "../src/Spendlock.sol";
import {ResultEscrow} from "../src/ResultEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// A target that tries to pull more than it was approved, or to re-enter the vault.
contract Greedy {
    MockUSDC usdc; Spendlock vault;
    constructor(MockUSDC u, Spendlock v) { usdc = u; vault = v; }
    function pull(uint256 amt) external { usdc.transferFrom(address(vault), address(this), amt); }
    function reenter() external { vault.spend(address(this), 1, "again"); }
    function boom() external pure { revert("boom"); }
}

contract SpendlockTest is Test {
    MockUSDC usdc;
    Spendlock vault;
    ResultEscrow esc;
    address owner = address(0xA11CE);
    address agentA = address(0xA);
    address agentB = address(0xB);
    address shop = address(0x5409);
    address worker = address(0xB0B);
    address verifier = address(0x7E);
    address treasury = address(0xFEE);
    uint256 constant USDC = 1e6;

    event Spent(address indexed agent, address indexed to, uint256 amount, uint256 indexed requestId, bool isCall, string memo);
    event SpendRejected(address indexed agent, address indexed to, uint256 amount, uint256 indexed requestId, string reason, string memo);
    event SpendRequested(uint256 indexed requestId, address indexed agent, address indexed to, uint256 amount, bool isCall, string memo);
    event PolicySet(address indexed agent, uint256 perTxCap, uint256 dailyLimit, uint256 totalBudget, uint256 approvalThreshold, uint64 expiry);
    event KillSwitch(bool killed);

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        vault = new Spendlock(address(usdc), owner);
        esc = new ResultEscrow(address(usdc), treasury, 200, 500 * USDC);
        usdc.mint(owner, 1000 * USDC);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(100 * USDC);
        // agent A: $20 per tx, $20/day, $60 total, ask above $18, ResultEscrow + shop allowed
        vault.setPolicy(agentA, uint128(20 * USDC), uint128(20 * USDC), uint128(60 * USDC), uint128(18 * USDC), 0);
        vault.setAllowed(agentA, address(esc), true);
        vault.setAllowed(agentA, shop, true);
        vm.stopPrank();
    }

    function _spend(address agent, address to, uint256 amt) internal returns (Spendlock.Result r, uint256 id) {
        vm.prank(agent);
        (r, id) = vault.spend(to, amt, "test");
    }

    function _jobCall(uint96 items) internal view returns (bytes memory) {
        return abi.encodeCall(ResultEscrow.createJob, (address(0), verifier, items, 3 * USDC, uint64(block.timestamp + 1 days), keccak256("spec")));
    }

    // ---------- basics ----------
    function test_fundAndWithdraw() public {
        assertEq(vault.balance(), 100 * USDC);
        vm.prank(owner); vault.withdraw(owner, 10 * USDC);
        assertEq(vault.balance(), 90 * USDC);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vm.prank(agentA); vault.withdraw(agentA, 1);
    }

    function test_twoStepOwnership() public {
        vm.prank(owner); vault.transferOwnership(agentB);
        assertEq(vault.owner(), owner); // not yet
        assertEq(vault.pendingOwner(), agentB);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vm.prank(agentA); vault.acceptOwnership();
        vm.prank(agentB); vault.acceptOwnership();
        assertEq(vault.owner(), agentB);
    }

    function test_onlyOwnerSetsPolicies() public {
        vm.startPrank(agentA);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vault.setPolicy(agentA, 1, 1, 1, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vault.setAllowed(agentA, agentA, true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vault.setKill(true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vault.setAgentPaused(agentA, false);
        vm.stopPrank();
    }

    function test_policyChangeEmits() public {
        vm.expectEmit(true, false, false, true);
        emit PolicySet(agentB, 1, 2, 3, 0, 99);
        vm.prank(owner); vault.setPolicy(agentB, 1, 2, 3, 0, 99);
        assertEq(vault.agentCount(), 2);
    }

    function test_nonAgentReverts() public {
        vm.expectRevert(Spendlock.NotAgent.selector);
        _spend(agentB, shop, 1);
    }

    function test_cannotAllowTokenOrSelf() public {
        vm.startPrank(owner);
        vm.expectRevert(Spendlock.BadTarget.selector); vault.setAllowed(agentA, address(usdc), true);
        vm.expectRevert(Spendlock.BadTarget.selector); vault.setAllowed(agentA, address(vault), true);
        vm.stopPrank();
        vm.expectRevert(Spendlock.BadTarget.selector);
        vm.prank(agentA); vault.approveAndCall(address(usdc), 1, abi.encodeCall(MockUSDC.transfer, (agentA, 1)), "sneaky");
    }

    // ---------- rules ----------
    function test_spendWithinRules() public {
        vm.expectEmit(true, true, true, true);
        emit Spent(agentA, shop, 5 * USDC, 0, false, "test");
        (Spendlock.Result r,) = _spend(agentA, shop, 5 * USDC);
        assertEq(uint8(r), uint8(Spendlock.Result.Executed));
        assertEq(usdc.balanceOf(shop), 5 * USDC);
        (, uint256 today, uint256 budget, uint256 now_) = vault.remaining(agentA);
        assertEq(today, 15 * USDC); assertEq(budget, 55 * USDC); assertEq(now_, 15 * USDC);
    }

    function test_rejectNotAllowlisted() public {
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, address(0xBAD), 1 * USDC, 0, "recipient not allowed", "test");
        (Spendlock.Result r,) = _spend(agentA, address(0xBAD), 1 * USDC);
        assertEq(uint8(r), uint8(Spendlock.Result.Rejected));
        assertEq(vault.balance(), 100 * USDC);
    }

    function test_rejectOverPerTxCap() public {
        vm.prank(owner); vault.setPolicy(agentA, uint128(10 * USDC), uint128(50 * USDC), uint128(60 * USDC), 0, 0);
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, shop, 11 * USDC, 0, "over per-tx cap", "test");
        _spend(agentA, shop, 11 * USDC);
        assertEq(vault.balance(), 100 * USDC);
    }

    function test_dailyLimitResetsNextDay() public {
        _spend(agentA, shop, 15 * USDC);
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, shop, 15 * USDC, 0, "over daily limit", "test");
        _spend(agentA, shop, 15 * USDC);
        (Spendlock.Result ok,) = _spend(agentA, shop, 5 * USDC); // exactly up to the limit is fine
        assertEq(uint8(ok), uint8(Spendlock.Result.Executed));
        vm.warp(block.timestamp + 1 days);
        assertEq(vault.spentToday(agentA), 0);
        (Spendlock.Result r,) = _spend(agentA, shop, 15 * USDC);
        assertEq(uint8(r), uint8(Spendlock.Result.Executed));
    }

    function test_totalBudget() public {
        for (uint256 i; i < 3; i++) { _spend(agentA, shop, 18 * USDC); vm.warp(block.timestamp + 1 days); }
        (Spendlock.Result r,) = _spend(agentA, shop, 7 * USDC); // 54 + 7 > 60
        assertEq(uint8(r), uint8(Spendlock.Result.Rejected));
        (Spendlock.Result r2,) = _spend(agentA, shop, 6 * USDC);
        assertEq(uint8(r2), uint8(Spendlock.Result.Executed));
        (,, uint256 budget,) = vault.remaining(agentA);
        assertEq(budget, 0);
    }

    function test_expiry() public {
        vm.prank(owner); vault.setPolicy(agentA, uint128(20 * USDC), uint128(20 * USDC), uint128(60 * USDC), 0, uint64(block.timestamp + 1 hours));
        (Spendlock.Result r1,) = _spend(agentA, shop, 1 * USDC);
        assertEq(uint8(r1), uint8(Spendlock.Result.Executed));
        vm.warp(block.timestamp + 2 hours);
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, shop, 1 * USDC, 0, "policy expired", "test");
        _spend(agentA, shop, 1 * USDC);
    }

    function test_pauseAgent() public {
        vm.prank(owner); vault.setAgentPaused(agentA, true);
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, shop, 1 * USDC, 0, "agent paused", "test");
        _spend(agentA, shop, 1 * USDC);
        vm.prank(owner); vault.setAgentPaused(agentA, false);
        (Spendlock.Result r,) = _spend(agentA, shop, 1 * USDC);
        assertEq(uint8(r), uint8(Spendlock.Result.Executed));
    }

    function test_killSwitchStopsEveryone() public {
        vm.startPrank(owner);
        vault.setPolicy(agentB, uint128(20 * USDC), uint128(20 * USDC), uint128(60 * USDC), 0, 0);
        vault.setAllowed(agentB, shop, true);
        vm.expectEmit(false, false, false, true); emit KillSwitch(true);
        vault.setKill(true);
        vm.stopPrank();
        (Spendlock.Result a,) = _spend(agentA, shop, 1 * USDC);
        (Spendlock.Result b,) = _spend(agentB, shop, 1 * USDC);
        assertEq(uint8(a), uint8(Spendlock.Result.Rejected));
        assertEq(uint8(b), uint8(Spendlock.Result.Rejected));
        (,,, uint256 now_) = vault.remaining(agentA);
        assertEq(now_, 0);
        vm.prank(owner); vault.withdraw(owner, 100 * USDC); // owner can still rescue funds
        assertEq(vault.balance(), 0);
    }

    function test_removedAgentCannotSpend() public {
        vm.prank(owner); vault.removeAgent(agentA);
        vm.expectRevert(Spendlock.NotAgent.selector);
        _spend(agentA, shop, 1);
    }

    function test_vaultBalanceTooLow() public {
        vm.prank(owner); vault.withdraw(owner, 95 * USDC);
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, shop, 6 * USDC, 0, "vault balance too low", "test");
        _spend(agentA, shop, 6 * USDC);
    }

    function test_zeroAmountRejected() public {
        (Spendlock.Result r,) = _spend(agentA, shop, 0);
        assertEq(uint8(r), uint8(Spendlock.Result.Rejected));
    }

    // ---------- approvals ----------
    function test_aboveThresholdGoesPendingThenApproved() public {
        vm.expectEmit(true, true, true, true);
        emit SpendRequested(1, agentA, shop, 19 * USDC, false, "test");
        (Spendlock.Result r, uint256 id) = _spend(agentA, shop, 19 * USDC);
        assertEq(uint8(r), uint8(Spendlock.Result.Pending));
        assertEq(id, 1);
        assertEq(vault.balance(), 100 * USDC); // nothing moved yet
        assertEq(vault.spentToday(agentA), 0);
        vm.prank(agentA); vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        vault.approveRequest(id);
        vm.prank(owner); Spendlock.Result r2 = vault.approveRequest(id);
        assertEq(uint8(r2), uint8(Spendlock.Result.Executed));
        assertEq(usdc.balanceOf(shop), 19 * USDC);
        assertEq(uint8(vault.getRequest(id).status), uint8(Spendlock.ReqStatus.Approved));
        vm.prank(owner); vm.expectRevert(Spendlock.NotPending.selector);
        vault.approveRequest(id); // no double execution
    }

    function test_ownerRejectsPending() public {
        (, uint256 id) = _spend(agentA, shop, 19 * USDC);
        vm.expectEmit(true, true, true, true);
        emit SpendRejected(agentA, shop, 19 * USDC, id, "not this week", "test");
        vm.prank(owner); vault.rejectRequest(id, "not this week");
        assertEq(uint8(vault.getRequest(id).status), uint8(Spendlock.ReqStatus.Rejected));
        assertEq(vault.balance(), 100 * USDC);
    }

    function test_approvalRechecksRules() public {
        (, uint256 id) = _spend(agentA, shop, 19 * USDC);
        _spend(agentA, shop, 5 * USDC); // uses up today's room
        vm.prank(owner); Spendlock.Result r = vault.approveRequest(id);
        assertEq(uint8(r), uint8(Spendlock.Result.Rejected)); // 5 + 19 > 20
        (, uint256 id2) = _spend(agentA, shop, 19 * USDC);
        assertEq(id2, 0); // rejected up front (daily), never pending
        vm.warp(block.timestamp + 1 days);
        (, uint256 id3) = _spend(agentA, shop, 19 * USDC);
        vm.prank(owner); vault.setKill(true);
        vm.prank(owner); assertEq(uint8(vault.approveRequest(id3)), uint8(Spendlock.Result.Rejected));
    }

    function test_agentCancelsOwnRequest() public {
        (, uint256 id) = _spend(agentA, shop, 19 * USDC);
        vm.prank(agentB); vm.expectRevert("not your request"); vault.cancelRequest(id);
        vm.prank(agentA); vault.cancelRequest(id);
        vm.prank(owner); vm.expectRevert(Spendlock.NotPending.selector); vault.approveRequest(id);
    }

    // ---------- approveAndCall + ResultEscrow ----------
    function test_fundEscrowJobAndRefundComesBack() public {
        vm.prank(agentA);
        (Spendlock.Result r,) = vault.approveAndCall(address(esc), 15 * USDC, _jobCall(5), "buy 5 wallets");
        assertEq(uint8(r), uint8(Spendlock.Result.Executed));
        (address client,,,,,,,,) = esc.jobs(1);
        assertEq(client, address(vault)); // the vault is the escrow client
        assertEq(vault.balance(), 85 * USDC);
        assertEq(usdc.allowance(address(vault), address(esc)), 0); // approval reset
        vm.prank(worker); esc.submitResult(1, keccak256("file"));
        vm.prank(verifier); esc.settle(1, 3, keccak256("report")); // 3/5 verified
        assertEq(vault.balance(), 91 * USDC); // $6 refund back into the vault
        assertEq(vault.spentToday(agentA), 15 * USDC); // refunds do not restore the limit
    }

    function test_approveAndCallCountsOnlyWhatWasPulled() public {
        Greedy g = new Greedy(usdc, vault);
        vm.prank(owner); vault.setAllowed(agentA, address(g), true);
        vm.prank(agentA); vault.approveAndCall(address(g), 10 * USDC, abi.encodeCall(Greedy.pull, (4 * USDC)), "partial");
        assertEq(vault.spentToday(agentA), 4 * USDC);
        assertEq(usdc.allowance(address(vault), address(g)), 0);
    }

    function test_approveAndCallCannotPullMore() public {
        Greedy g = new Greedy(usdc, vault);
        vm.prank(owner); vault.setAllowed(agentA, address(g), true);
        vm.prank(agentA);
        (Spendlock.Result r,) = vault.approveAndCall(address(g), 5 * USDC, abi.encodeCall(Greedy.pull, (6 * USDC)), "greedy");
        assertEq(uint8(r), uint8(Spendlock.Result.Rejected)); // inner call failed
        assertEq(vault.balance(), 100 * USDC);
        assertEq(vault.spentToday(agentA), 0);
    }

    function test_noReentrancy() public {
        Greedy g = new Greedy(usdc, vault);
        vm.startPrank(owner);
        vault.setPolicy(address(g), uint128(5 * USDC), uint128(5 * USDC), uint128(5 * USDC), 0, 0);
        vault.setAllowed(address(g), address(g), true);
        vault.setAllowed(agentA, address(g), true);
        vm.stopPrank();
        vm.prank(agentA);
        (Spendlock.Result r,) = vault.approveAndCall(address(g), 1 * USDC, abi.encodeCall(Greedy.reenter, ()), "reenter");
        assertEq(uint8(r), uint8(Spendlock.Result.Rejected));
        assertEq(vault.balance(), 100 * USDC);
    }

    function test_approveAndCallPendingThenApproved() public {
        vm.prank(agentA);
        (Spendlock.Result r, uint256 id) = vault.approveAndCall(address(esc), 19 * USDC, abi.encodeCall(ResultEscrow.createJob,
            (address(0), verifier, 19, 1 * USDC, uint64(block.timestamp + 1 days), keccak256("s"))), "big job");
        assertEq(uint8(r), uint8(Spendlock.Result.Pending));
        vm.prank(owner); vault.approveRequest(id);
        assertEq(esc.jobCount(), 1);
        assertEq(vault.balance(), 81 * USDC);
    }

    // ---------- fuzz ----------
    function testFuzz_singleSpendNeverBreaksRules(uint256 amt, address to) public {
        amt = bound(amt, 0, 200 * USDC);
        uint256 before = vault.balance();
        (Spendlock.Result r,) = _spend(agentA, to, amt);
        bool ok = (to == shop || to == address(esc)) && amt > 0 && amt <= 18 * USDC;
        if (ok) assertEq(uint8(r), uint8(Spendlock.Result.Executed));
        if (r == Spendlock.Result.Executed) {
            assertTrue(ok);
            assertEq(vault.balance(), before - amt);
        } else {
            assertEq(vault.balance(), before);
        }
    }

    function testFuzz_manySpendsStayUnderLimits(uint256[8] memory amts, uint256[8] memory gaps) public {
        uint256 total; uint256 day = block.timestamp / 1 days; uint256 dayTotal;
        for (uint256 i; i < 8; i++) {
            vm.warp(block.timestamp + bound(gaps[i], 0, 2 days));
            if (block.timestamp / 1 days != day) { day = block.timestamp / 1 days; dayTotal = 0; }
            uint256 a = bound(amts[i], 1, 18 * USDC);
            (Spendlock.Result r,) = _spend(agentA, shop, a);
            if (r == Spendlock.Result.Executed) { total += a; dayTotal += a; }
            assertLe(dayTotal, 20 * USDC);
            assertLe(total, 60 * USDC);
        }
        assertEq(usdc.balanceOf(shop), total);
        assertEq(vault.balance() + total, 100 * USDC);
    }
}
