// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ResultEscrow (Spendlock v0)
/// @notice Pay-per-verified-result escrow.
///  1. A client posts a job: "N items at P USDC each, verifier V, deadline D".
///     The full budget (N * P) is locked in this contract.
///  2. A worker submits a result (an off-chain file, identified by its hash).
///  3. The verifier checks the file off-chain and calls settle(jobId, verifiedCount).
///     Worker gets verifiedCount * P minus the protocol fee. The client gets the rest back.
///  4. If nobody settles before the deadline, the client can take everything back.
///  Spendlock "brakes": a per-job budget cap, and a pause switch for new jobs.
contract ResultEscrow {
    enum Status { None, Open, Submitted, Settled, Refunded }

    struct Job {
        address client;      // who pays
        address worker;      // who gets paid (0 = anyone may submit first)
        address verifier;    // who decides how many items were valid
        uint96 maxItems;     // how many items the client wants at most
        uint256 pricePerItem;// USDC units (6 decimals: 1 USDC = 1_000_000)
        uint64 deadline;     // unix time; after this the client can refund
        Status status;
        bytes32 specHash;    // hash of the job spec (criteria) stored off-chain
        bytes32 resultHash;  // hash of the delivered file
    }

    uint16 public constant MAX_FEE_BPS = 1000; // fee can never exceed 10%

    IERC20 public immutable usdc;
    address public owner;
    address public feeRecipient;
    uint16 public feeBps;          // 200 = 2%
    uint256 public maxJobBudget;   // Spendlock cap per job (USDC units)
    bool public paused;            // kill switch: blocks new jobs only
    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address verifier, uint256 maxItems, uint256 pricePerItem, uint64 deadline, bytes32 specHash);
    event ResultSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash);
    event JobSettled(uint256 indexed jobId, uint256 verifiedCount, uint256 toWorker, uint256 fee, uint256 refund, bytes32 reportHash);
    event JobRefunded(uint256 indexed jobId, uint256 amount);
    event ConfigChanged(uint16 feeBps, address feeRecipient, uint256 maxJobBudget, bool paused);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor(address usdc_, address feeRecipient_, uint16 feeBps_, uint256 maxJobBudget_) {
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        usdc = IERC20(usdc_);
        owner = msg.sender;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        maxJobBudget = maxJobBudget_;
    }

    // ---------- client ----------

    function createJob(
        address worker,
        address verifier,
        uint96 maxItems,
        uint256 pricePerItem,
        uint64 deadline,
        bytes32 specHash
    ) external returns (uint256 jobId) {
        require(!paused, "paused");
        require(verifier != address(0), "no verifier");
        require(maxItems > 0 && pricePerItem > 0, "empty job");
        require(deadline > block.timestamp, "deadline passed");
        uint256 budget = uint256(maxItems) * pricePerItem;
        require(budget <= maxJobBudget, "over budget cap");

        jobId = ++jobCount;
        jobs[jobId] = Job(msg.sender, worker, verifier, maxItems, pricePerItem, deadline, Status.Open, specHash, bytes32(0));
        // Effects before interaction; pull the money in last.
        require(usdc.transferFrom(msg.sender, address(this), budget), "transfer in failed");
        emit JobCreated(jobId, msg.sender, verifier, maxItems, pricePerItem, deadline, specHash);
    }

    /// After the deadline, if the job was never settled, the client gets everything back.
    function refundExpired(uint256 jobId) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Open || j.status == Status.Submitted, "not refundable");
        require(block.timestamp > j.deadline, "not expired");
        uint256 amount = uint256(j.maxItems) * j.pricePerItem;
        j.status = Status.Refunded;
        require(usdc.transfer(j.client, amount), "refund failed");
        emit JobRefunded(jobId, amount);
    }

    // ---------- worker ----------

    function submitResult(uint256 jobId, bytes32 resultHash) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Open, "not open");
        require(block.timestamp <= j.deadline, "expired");
        if (j.worker == address(0)) j.worker = msg.sender; // open job: first submitter takes it
        require(j.worker == msg.sender, "not worker");
        j.resultHash = resultHash;
        j.status = Status.Submitted;
        emit ResultSubmitted(jobId, msg.sender, resultHash);
    }

    // ---------- verifier ----------

    /// Pays verifiedCount items to the worker (minus fee), refunds the rest to the client.
    function settle(uint256 jobId, uint256 verifiedCount, bytes32 reportHash) external {
        Job storage j = jobs[jobId];
        require(msg.sender == j.verifier, "not verifier");
        require(j.status == Status.Submitted, "not submitted");
        if (verifiedCount > j.maxItems) verifiedCount = j.maxItems;

        uint256 budget = uint256(j.maxItems) * j.pricePerItem;
        uint256 earned = verifiedCount * j.pricePerItem;
        uint256 fee = (earned * feeBps) / 10_000;
        uint256 toWorker = earned - fee;
        uint256 refund = budget - earned;
        j.status = Status.Settled;

        if (toWorker > 0) require(usdc.transfer(j.worker, toWorker), "pay failed");
        if (fee > 0) require(usdc.transfer(feeRecipient, fee), "fee failed");
        if (refund > 0) require(usdc.transfer(j.client, refund), "refund failed");
        emit JobSettled(jobId, verifiedCount, toWorker, fee, refund, reportHash);
    }

    // ---------- owner (Spendlock policy) ----------

    function setConfig(uint16 feeBps_, address feeRecipient_, uint256 maxJobBudget_, bool paused_) external onlyOwner {
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        maxJobBudget = maxJobBudget_;
        paused = paused_;
        emit ConfigChanged(feeBps_, feeRecipient_, maxJobBudget_, paused_);
    }

    function budgetOf(uint256 jobId) external view returns (uint256) {
        return uint256(jobs[jobId].maxItems) * jobs[jobId].pricePerItem;
    }
}
