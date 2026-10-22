// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Spendlock: agent spend rails
/// @notice An owner (a person or a company) funds this vault with USDC and gives AI agents
///         spending power under hard onchain rules. Per agent:
///           - per-transaction cap        - daily limit (UTC day window)
///           - total budget               - recipient allowlist (wallets or contracts)
///           - expiry                     - pause switch
///           - approval threshold: spends above it wait for the owner (approve / reject)
///         Plus one global kill switch that stops every agent at once.
///         Agent Profiles (name, Walmart-style approval rule, per-agent history, pause/delete)
///         sit on top of these per-agent limits in the dashboard/MCP. This contract is the
///         custody: the agent cannot raise its cap, skip approval, or unpause itself.
///         Spendlock never holds customer money — funds stay in this vault.
/// @dev    Policy failures do NOT revert: they emit SpendRejected and return Result.Rejected, so the
///         rejection itself is stored onchain (an audit trail). Only callers that are not agents revert.
///         Refunds from contracts like ResultEscrow come straight back here, because this vault is the
///         escrow "client". Refunds do not give budget back to the agent (conservative).
contract Spendlock is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Result { Executed, Pending, Rejected }
    enum ReqStatus { None, Pending, Approved, Rejected, Cancelled }

    struct Policy {
        uint128 perTxCap;          // max per single spend
        uint128 dailyLimit;        // max per UTC day
        uint128 totalBudget;       // max over the agent's whole life
        uint128 approvalThreshold; // spends ABOVE this wait for the owner; 0 = never ask
        uint64 expiry;             // unix time after which the agent cannot spend; 0 = never expires
        bool active;               // false = not an agent (or removed)
        bool paused;               // owner pause for this agent only
    }

    struct Usage {
        uint128 spentTotal;
        uint128 spentToday;
        uint64 day; // UTC day number that spentToday belongs to
    }

    struct Request {
        address agent;
        address to;        // recipient (spend) or target contract (approveAndCall)
        uint128 amount;
        uint64 createdAt;
        ReqStatus status;
        bool isCall;
        bytes data;        // calldata for approveAndCall requests
        string memo;
    }

    IERC20 public immutable token;
    bool public killed; // global kill switch
    mapping(address => Policy) public policies;
    mapping(address => Usage) public usage;
    mapping(address => mapping(address => bool)) public allowed; // agent => recipient/target => ok
    address[] public agentList; // every address that ever got a policy (for dashboards)
    mapping(address => bool) private known;
    Request[] internal requests;

    // ---- audit trail ----
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event PolicySet(address indexed agent, uint256 perTxCap, uint256 dailyLimit, uint256 totalBudget, uint256 approvalThreshold, uint64 expiry);
    event AgentRemoved(address indexed agent);
    event AgentPaused(address indexed agent, bool paused);
    event AllowlistSet(address indexed agent, address indexed target, bool allowed);
    event KillSwitch(bool killed);
    event Spent(address indexed agent, address indexed to, uint256 amount, uint256 indexed requestId, bool isCall, string memo);
    event SpendRejected(address indexed agent, address indexed to, uint256 amount, uint256 indexed requestId, string reason, string memo);
    event SpendRequested(uint256 indexed requestId, address indexed agent, address indexed to, uint256 amount, bool isCall, string memo);
    event RequestRejected(uint256 indexed requestId, string reason);
    event RequestCancelled(uint256 indexed requestId);

    error NotAgent();
    error BadTarget();
    error NotPending();

    /// requestId 0 means "no request" (a direct spend), so request ids start at 1.
    constructor(address token_, address owner_) Ownable(owner_) {
        require(token_ != address(0), "zero token");
        token = IERC20(token_);
        requests.push(); // slot 0 unused
    }

    // =========================== owner ===========================

    /// Anyone may top up the vault (approve first). A plain token transfer also works.
    function fund(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function setPolicy(address agent, uint128 perTxCap, uint128 dailyLimit, uint128 totalBudget, uint128 approvalThreshold, uint64 expiry)
        external onlyOwner
    {
        require(agent != address(0), "zero agent");
        Policy storage p = policies[agent];
        p.perTxCap = perTxCap;
        p.dailyLimit = dailyLimit;
        p.totalBudget = totalBudget;
        p.approvalThreshold = approvalThreshold;
        p.expiry = expiry;
        p.active = true;
        if (!known[agent]) { known[agent] = true; agentList.push(agent); }
        emit PolicySet(agent, perTxCap, dailyLimit, totalBudget, approvalThreshold, expiry);
    }

    function removeAgent(address agent) external onlyOwner {
        policies[agent].active = false;
        emit AgentRemoved(agent);
    }

    function setAllowed(address agent, address target, bool ok) external onlyOwner {
        if (target == address(token) || target == address(this) || target == address(0)) revert BadTarget();
        allowed[agent][target] = ok;
        emit AllowlistSet(agent, target, ok);
    }

    function setAgentPaused(address agent, bool paused) external onlyOwner {
        policies[agent].paused = paused;
        emit AgentPaused(agent, paused);
    }

    function setKill(bool on) external onlyOwner {
        killed = on;
        emit KillSwitch(on);
    }

    /// Run a pending request. All rules are checked AGAIN now (limits, pause, kill switch, expiry);
    /// the approval only lifts the "above threshold" rule. If a rule fails now, the request is rejected.
    function approveRequest(uint256 id) external onlyOwner nonReentrant returns (Result) {
        Request storage r = _pending(id);
        string memory reason = _check(r.agent, r.to, r.amount);
        if (bytes(reason).length != 0) {
            r.status = ReqStatus.Rejected;
            emit SpendRejected(r.agent, r.to, r.amount, id, reason, r.memo);
            emit RequestRejected(id, reason);
            return Result.Rejected;
        }
        r.status = ReqStatus.Approved;
        Result res = _execute(r.agent, r.to, r.amount, r.isCall, r.data, r.memo, id);
        if (res == Result.Rejected) r.status = ReqStatus.Rejected;
        return res;
    }

    function rejectRequest(uint256 id, string calldata reason) external onlyOwner {
        Request storage r = _pending(id);
        r.status = ReqStatus.Rejected;
        emit SpendRejected(r.agent, r.to, r.amount, id, reason, r.memo);
        emit RequestRejected(id, reason);
    }

    // =========================== agents ===========================

    /// Pay `amount` USDC to `to`. Returns Executed, Pending (needs owner approval) or Rejected.
    function spend(address to, uint256 amount, string calldata memo) external nonReentrant returns (Result, uint256 requestId) {
        return _request(to, amount, false, "", memo);
    }

    /// Approve `target` to pull up to `amount` USDC, call it with `data`, then reset the approval to 0.
    /// Example: ResultEscrow.createJob(...) funds a job with this vault as the client, so refunds return here.
    /// Only what the target actually pulled counts against the limits.
    function approveAndCall(address target, uint256 amount, bytes calldata data, string calldata memo)
        external nonReentrant returns (Result, uint256 requestId)
    {
        if (target == address(token) || target == address(this)) revert BadTarget();
        return _request(target, amount, true, data, memo);
    }

    /// An agent can withdraw its own pending request.
    function cancelRequest(uint256 id) external {
        Request storage r = _pending(id);
        require(r.agent == msg.sender, "not your request");
        r.status = ReqStatus.Cancelled;
        emit RequestCancelled(id);
    }

    // =========================== views ===========================

    /// What an agent can still spend right now (0s when it cannot spend at all).
    function remaining(address agent) public view returns (uint256 perTx, uint256 today, uint256 budget, uint256 spendableNow) {
        Policy memory p = policies[agent];
        Usage memory u = usage[agent];
        uint256 usedToday = u.day == _today() ? u.spentToday : 0;
        perTx = p.perTxCap;
        today = p.dailyLimit > usedToday ? p.dailyLimit - usedToday : 0;
        budget = p.totalBudget > u.spentTotal ? p.totalBudget - u.spentTotal : 0;
        spendableNow = _min(_min(perTx, today), _min(budget, token.balanceOf(address(this))));
        if (!p.active || p.paused || killed || (p.expiry != 0 && block.timestamp > p.expiry)) spendableNow = 0;
    }

    function spentToday(address agent) external view returns (uint256) {
        Usage memory u = usage[agent];
        return u.day == _today() ? u.spentToday : 0;
    }

    function getRequest(uint256 id) external view returns (Request memory) { return requests[id]; }
    function requestCount() external view returns (uint256) { return requests.length - 1; }
    function agentCount() external view returns (uint256) { return agentList.length; }
    function balance() external view returns (uint256) { return token.balanceOf(address(this)); }

    /// Empty string = the spend passes every rule except the approval threshold.
    function check(address agent, address to, uint256 amount) external view returns (string memory) { return _check(agent, to, amount); }

    // =========================== internals ===========================

    function _request(address to, uint256 amount, bool isCall, bytes memory data, string calldata memo)
        internal returns (Result, uint256)
    {
        Policy memory p = policies[msg.sender];
        if (!p.active) revert NotAgent();
        string memory reason = _check(msg.sender, to, amount);
        if (bytes(reason).length != 0) {
            emit SpendRejected(msg.sender, to, amount, 0, reason, memo);
            return (Result.Rejected, 0);
        }
        if (p.approvalThreshold != 0 && amount > p.approvalThreshold) {
            uint256 id = requests.length;
            // forge-lint: disable-next-line(unsafe-typecast) amount <= perTxCap (a uint128), checked above
            requests.push(Request(msg.sender, to, uint128(amount), uint64(block.timestamp), ReqStatus.Pending, isCall, data, memo));
            emit SpendRequested(id, msg.sender, to, amount, isCall, memo);
            return (Result.Pending, id);
        }
        return (_execute(msg.sender, to, amount, isCall, data, memo, 0), 0);
    }

    function _check(address agent, address to, uint256 amount) internal view returns (string memory) {
        Policy memory p = policies[agent];
        if (killed) return "kill switch on";
        if (!p.active) return "agent removed";
        if (p.paused) return "agent paused";
        if (p.expiry != 0 && block.timestamp > p.expiry) return "policy expired";
        if (amount == 0) return "zero amount";
        if (!allowed[agent][to]) return "recipient not allowed";
        if (amount > p.perTxCap) return "over per-tx cap";
        Usage memory u = usage[agent];
        uint256 spent = u.day == _today() ? u.spentToday : 0;
        if (spent + amount > p.dailyLimit) return "over daily limit";
        if (uint256(u.spentTotal) + amount > p.totalBudget) return "over total budget";
        if (token.balanceOf(address(this)) < amount) return "vault balance too low";
        return "";
    }

    /// Rules already passed. Moves the money and records usage.
    function _execute(address agent, address to, uint256 amount, bool isCall, bytes memory data, string memory memo, uint256 id)
        internal returns (Result)
    {
        uint256 used = amount;
        if (!isCall) {
            _record(agent, amount);
            token.safeTransfer(to, amount);
        } else {
            uint256 before = token.balanceOf(address(this));
            token.forceApprove(to, amount);
            (bool ok,) = to.call(data);
            token.forceApprove(to, 0);
            if (!ok) {
                emit SpendRejected(agent, to, amount, id, "call failed", memo);
                return Result.Rejected;
            }
            uint256 afterBal = token.balanceOf(address(this));
            used = afterBal < before ? before - afterBal : 0;
            require(used <= amount, "pulled too much"); // cannot happen: allowance was `amount`
            _record(agent, used);
        }
        emit Spent(agent, to, used, id, isCall, memo);
        return Result.Executed;
    }

    function _record(address agent, uint256 amount) internal {
        Usage storage u = usage[agent];
        uint64 d = _today();
        if (u.day != d) { u.day = d; u.spentToday = 0; }
        // forge-lint: disable-next-line(unsafe-typecast) amount <= perTxCap (a uint128)
        u.spentToday += uint128(amount);
        // forge-lint: disable-next-line(unsafe-typecast)
        u.spentTotal += uint128(amount);
    }

    function _pending(uint256 id) internal view returns (Request storage r) {
        if (id == 0 || id >= requests.length) revert NotPending();
        r = requests[id];
        if (r.status != ReqStatus.Pending) revert NotPending();
    }

    // forge-lint: disable-next-line(unsafe-typecast) day numbers fit in uint64 for billions of years
    function _today() internal view returns (uint64) { return uint64(block.timestamp / 1 days); }
    function _min(uint256 a, uint256 b) internal pure returns (uint256) { return a < b ? a : b; }
}
