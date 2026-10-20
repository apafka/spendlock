// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Spendlock} from "../src/Spendlock.sol";
import {ResultEscrow} from "../src/ResultEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Random sequences of agent spends, escrow jobs, refunds, owner approvals/rejections, pauses,
/// kill switch, deposits, withdrawals and time jumps. Ghost variables record what really left the vault.
contract Handler is Test {
    MockUSDC public usdc;
    Spendlock public vault;
    ResultEscrow public esc;
    address public owner;
    address public verifier = address(0x7E);
    address public worker = address(0xB0B);
    address[3] public agents = [address(0xA1), address(0xA2), address(0xA3)];
    address[3] public sinks = [address(0x51), address(0x52), address(0x53)]; // 0x53 is never allowlisted
    uint256 constant USDC = 1e6;

    // per-agent rules (fixed for the whole run)
    mapping(address => uint256) public perTx;
    mapping(address => uint256) public daily;
    mapping(address => uint256) public budget;

    // ghosts
    mapping(address => uint256) public ghostSpent;                       // total that left the vault for this agent
    mapping(address => mapping(uint256 => uint256)) public ghostSpentDay; // per UTC day
    mapping(address => uint256) public ghostMaxSingle;
    uint256 public ghostFunded;
    uint256 public ghostWithdrawn;
    uint256 public ghostOut;     // all agent spends
    uint256 public ghostRefunds; // escrow refunds back into the vault
    uint256 public ghostDailyBreaches;
    uint256 public openJobs;
    uint256 public settledUpTo;

    constructor(MockUSDC u, Spendlock v, ResultEscrow e, address o) {
        usdc = u; vault = v; esc = e; owner = o;
        uint256[3] memory caps = [uint256(5), 10, 20];
        for (uint256 i; i < 3; i++) {
            address a = agents[i];
            perTx[a] = caps[i] * USDC; daily[a] = caps[i] * 2 * USDC; budget[a] = caps[i] * 5 * USDC;
            vm.startPrank(owner);
            vault.setPolicy(a, uint128(perTx[a]), uint128(daily[a]), uint128(budget[a]), uint128(perTx[a] / 2), 0);
            vault.setAllowed(a, sinks[0], true);
            vault.setAllowed(a, sinks[1], true);
            vault.setAllowed(a, address(esc), true);
            vm.stopPrank();
        }
        ghostFunded = usdc.balanceOf(address(vault));
    }

    function _agent(uint256 s) internal view returns (address) { return agents[s % 3]; }

    function _account(address a, uint256 before) internal {
        uint256 afterBal = usdc.balanceOf(address(vault));
        if (afterBal >= before) return;
        uint256 out = before - afterBal;
        ghostSpent[a] += out;
        ghostSpentDay[a][block.timestamp / 1 days] += out;
        if (out > ghostMaxSingle[a]) ghostMaxSingle[a] = out;
        ghostOut += out;
        if (ghostSpentDay[a][block.timestamp / 1 days] > daily[a]) ghostDailyBreaches++;
    }

    function spend(uint256 agentSeed, uint256 sinkSeed, uint256 amount) external {
        address a = _agent(agentSeed);
        amount = bound(amount, 0, 30 * USDC);
        uint256 before = usdc.balanceOf(address(vault));
        vm.prank(a);
        vault.spend(sinks[sinkSeed % 3], amount, "fuzz");
        _account(a, before);
    }

    function fundJob(uint256 agentSeed, uint256 items, uint256 approveExtra) external {
        address a = _agent(agentSeed);
        items = bound(items, 1, 20);
        uint256 cost = items * USDC;
        uint256 amount = cost + bound(approveExtra, 0, 3) * USDC; // agent may approve more than needed
        bytes memory data = abi.encodeCall(ResultEscrow.createJob, (worker, verifier, uint96(items), USDC, uint64(block.timestamp + 1 days), bytes32(0)));
        uint256 before = usdc.balanceOf(address(vault));
        vm.prank(a);
        vault.approveAndCall(address(esc), amount, data, "job");
        _account(a, before);
    }

    function settleNext(uint256 verified) external {
        uint256 id = settledUpTo + 1;
        if (id > esc.jobCount()) return;
        settledUpTo = id;
        vm.prank(worker); esc.submitResult(id, bytes32(id));
        uint256 before = usdc.balanceOf(address(vault));
        vm.prank(verifier); esc.settle(id, bound(verified, 0, 25), bytes32(0));
        ghostRefunds += usdc.balanceOf(address(vault)) - before;
    }

    function approve(uint256 id) external {
        uint256 n = vault.requestCount();
        if (n == 0) return;
        id = bound(id, 1, n);
        if (vault.getRequest(id).status != Spendlock.ReqStatus.Pending) return;
        address a = vault.getRequest(id).agent;
        uint256 before = usdc.balanceOf(address(vault));
        vm.prank(owner); vault.approveRequest(id);
        _account(a, before);
    }

    function reject(uint256 id) external {
        uint256 n = vault.requestCount();
        if (n == 0) return;
        id = bound(id, 1, n);
        if (vault.getRequest(id).status != Spendlock.ReqStatus.Pending) return;
        vm.prank(owner); vault.rejectRequest(id, "no");
    }

    function togglePause(uint256 agentSeed) external {
        address a = _agent(agentSeed);
        (,,,,, , bool paused) = vault.policies(a);
        vm.prank(owner); vault.setAgentPaused(a, !paused);
    }

    function toggleKill() external { vm.prank(owner); vault.setKill(!vault.killed()); }

    function deposit(uint256 amount) external {
        amount = bound(amount, 0, 50 * USDC);
        usdc.mint(owner, amount);
        vm.startPrank(owner); usdc.approve(address(vault), amount); vault.fund(amount); vm.stopPrank();
        ghostFunded += amount;
    }

    function withdraw(uint256 amount) external {
        amount = bound(amount, 0, usdc.balanceOf(address(vault)));
        vm.prank(owner); vault.withdraw(owner, amount);
        ghostWithdrawn += amount;
    }

    function warp(uint256 secs) external { vm.warp(block.timestamp + bound(secs, 0, 2 days)); }
}

contract SpendlockInvariantTest is StdInvariant, Test {
    MockUSDC usdc;
    Spendlock vault;
    ResultEscrow esc;
    Handler h;
    address owner = address(0xA11CE);

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        vault = new Spendlock(address(usdc), owner);
        esc = new ResultEscrow(address(usdc), address(0xFEE), 200, 500e6);
        usdc.mint(address(vault), 200e6);
        h = new Handler(usdc, vault, esc, owner);
        targetContract(address(h));
    }

    /// No agent ever spends more than its per-tx cap, daily limit or total budget.
    function invariant_agentsNeverExceedCaps() public view {
        for (uint256 i; i < 3; i++) {
            address a = h.agents(i);
            assertLe(h.ghostMaxSingle(a), h.perTx(a), "per-tx cap");
            assertLe(h.ghostSpent(a), h.budget(a), "budget");
            assertLe(h.ghostSpentDay(a, block.timestamp / 1 days), h.daily(a), "daily");
            (uint128 spentTotal,,) = vault.usage(a);
            assertEq(spentTotal, h.ghostSpent(a), "onchain usage matches what left the vault");
        }
        assertEq(h.ghostDailyBreaches(), 0, "daily limit breached on some day");
    }

    /// Funds are never lost: vault balance = in - out + refunds, and every token is accounted for.
    function invariant_fundsNeverLost() public view {
        assertEq(usdc.balanceOf(address(vault)), h.ghostFunded() + h.ghostRefunds() - h.ghostWithdrawn() - h.ghostOut(), "vault accounting");
        uint256 sum = usdc.balanceOf(address(vault)) + usdc.balanceOf(address(esc)) + usdc.balanceOf(owner)
            + usdc.balanceOf(h.worker()) + usdc.balanceOf(address(0xFEE));
        for (uint256 i; i < 3; i++) sum += usdc.balanceOf(h.sinks(i));
        assertEq(sum, usdc.totalSupply(), "every token accounted for");
        assertEq(usdc.balanceOf(h.sinks(2)), 0, "never-allowlisted address got paid");
        assertEq(usdc.allowance(address(vault), address(esc)), 0, "no leftover approval");
    }
}
