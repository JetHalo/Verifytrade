// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IZkVerifyAttestor} from "./interfaces/IZkVerifyAttestor.sol";

/// @title VerifyTrade Competition Contract
/// @notice On-chain leaderboard and reward distribution for a ZK-TLS-verified
///         Binance Futures trading competition. Each Round is a separate
///         competition window with its own period, threshold, and reward pool.
///         The same compiled Noir circuit serves every Round; only the
///         public inputs change.
contract Competition {
    // -------- Data types --------

    struct Round {
        uint64 periodStart;        // Unix ms
        uint64 periodEnd;          // Unix ms
        int64  thresholdUsdtX1e8;  // PnL threshold in USDT × 1e8 (signed)
        uint256 rewardPool;        // total reward to distribute
        bool active;
        bool finalized;
    }

    struct Submission {
        address wallet;
        int64 pnlUsdtX1e8;         // user-claimed PnL (proven by ZK)
        bytes32 binanceUidHash;    // for sybil resistance — one UID per Round
        uint64 submittedAt;
    }

    // -------- Storage --------

    address public owner;
    IZkVerifyAttestor public zkVerify;

    uint256 public nextRoundId;
    mapping(uint256 => Round) public rounds;

    /// roundId => wallet => submission
    mapping(uint256 => mapping(address => Submission)) public submissions;

    /// roundId => binanceUidHash => already submitted?
    mapping(uint256 => mapping(bytes32 => bool)) public uidUsedInRound;

    /// roundId => array of submitters (for leaderboard iteration)
    mapping(uint256 => address[]) public roundSubmitters;

    /// roundId => wallet => has claimed?
    mapping(uint256 => mapping(address => bool)) public claimed;

    // -------- Events --------

    event RoundCreated(
        uint256 indexed roundId,
        uint64 periodStart,
        uint64 periodEnd,
        int64 thresholdUsdtX1e8,
        uint256 rewardPool
    );
    event ProofSubmitted(
        uint256 indexed roundId,
        address indexed wallet,
        int64 pnlUsdtX1e8,
        bytes32 binanceUidHash
    );
    event RoundFinalized(uint256 indexed roundId);
    event RewardClaimed(uint256 indexed roundId, address indexed wallet, uint256 amount);

    // -------- Errors --------

    error NotOwner();
    error RoundNotActive();
    error RoundAlreadyFinalized();
    error PublicInputMismatch();
    error AttestationInvalid();
    error UidAlreadyUsed();
    error AlreadySubmitted();
    error AlreadyClaimed();
    error NotEligibleForReward();
    error InvalidConfig();

    // -------- Constructor --------

    constructor(address _zkVerify) {
        owner = msg.sender;
        zkVerify = IZkVerifyAttestor(_zkVerify);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // -------- Admin: round lifecycle --------

    function createRound(
        uint64 periodStart,
        uint64 periodEnd,
        int64 thresholdUsdtX1e8,
        uint256 rewardPool
    ) external payable onlyOwner returns (uint256 roundId) {
        if (periodEnd <= periodStart) revert InvalidConfig();
        if (msg.value != rewardPool) revert InvalidConfig();

        roundId = nextRoundId++;
        rounds[roundId] = Round({
            periodStart: periodStart,
            periodEnd: periodEnd,
            thresholdUsdtX1e8: thresholdUsdtX1e8,
            rewardPool: rewardPool,
            active: true,
            finalized: false
        });

        emit RoundCreated(roundId, periodStart, periodEnd, thresholdUsdtX1e8, rewardPool);
    }

    function finalizeRound(uint256 roundId) external onlyOwner {
        Round storage r = rounds[roundId];
        if (!r.active) revert RoundNotActive();
        r.active = false;
        r.finalized = true;
        emit RoundFinalized(roundId);
    }

    // -------- User: proof submission --------

    /// @notice Submit a zkVerify-attested proof for the given Round.
    ///         Public inputs are passed in plaintext for transparency and must
    ///         exactly match what was used to generate the proof.
    /// @param roundId The Round you're submitting to
    /// @param attestationId Reference returned by zkVerify after off-chain verification
    /// @param thresholdEncoded Encoded threshold (must equal Round's threshold, offset by PNL_OFFSET)
    /// @param periodStart  Must equal Round's periodStart
    /// @param periodEnd    Must equal Round's periodEnd
    /// @param userWallet   Must equal msg.sender
    /// @param uidBindingHash poseidon(binance_uid, user_wallet) — locks UID to this wallet
    /// @param disclosedCommitment TLSNotary commitment hash
    /// @param pnlUsdtX1e8 User's claimed PnL (the circuit proves this is > threshold)
    function submitProof(
        uint256 roundId,
        bytes32 attestationId,
        uint256 thresholdEncoded,
        uint64 periodStart,
        uint64 periodEnd,
        address userWallet,
        bytes32 uidBindingHash,
        bytes32 disclosedCommitment,
        int64 pnlUsdtX1e8
    ) external {
        Round storage r = rounds[roundId];
        if (!r.active) revert RoundNotActive();
        if (r.finalized) revert RoundAlreadyFinalized();

        // 1. Public inputs must match Round config.
        if (periodStart != r.periodStart || periodEnd != r.periodEnd) revert PublicInputMismatch();
        if (thresholdEncoded != _encode(r.thresholdUsdtX1e8)) revert PublicInputMismatch();
        if (userWallet != msg.sender) revert PublicInputMismatch();

        // 2. Sybil guard: each Binance UID can submit at most once per Round.
        if (uidUsedInRound[roundId][uidBindingHash]) revert UidAlreadyUsed();

        // 3. One submission per wallet per Round.
        if (submissions[roundId][msg.sender].submittedAt != 0) revert AlreadySubmitted();

        // 4. Verify via zkVerify.
        bytes32 publicInputDigest = keccak256(abi.encode(
            thresholdEncoded,
            periodStart,
            periodEnd,
            userWallet,
            uidBindingHash,
            disclosedCommitment
        ));
        if (!zkVerify.verifyAttestation(attestationId, publicInputDigest)) {
            revert AttestationInvalid();
        }

        // 5. Record submission.
        submissions[roundId][msg.sender] = Submission({
            wallet: msg.sender,
            pnlUsdtX1e8: pnlUsdtX1e8,
            binanceUidHash: uidBindingHash,
            submittedAt: uint64(block.timestamp)
        });
        uidUsedInRound[roundId][uidBindingHash] = true;
        roundSubmitters[roundId].push(msg.sender);

        emit ProofSubmitted(roundId, msg.sender, pnlUsdtX1e8, uidBindingHash);
    }

    // -------- User: claim reward --------

    /// @notice Claim reward after the Round is finalized.
    ///         Distribution: top 10 split the pool proportionally to PnL, weighted equally.
    ///         For workshop demo simplicity, this version splits the pool equally among
    ///         the top 10 submitters. Replace with your own distribution logic.
    function claimReward(uint256 roundId) external {
        Round storage r = rounds[roundId];
        if (!r.finalized) revert RoundNotActive();
        if (claimed[roundId][msg.sender]) revert AlreadyClaimed();

        Submission memory s = submissions[roundId][msg.sender];
        if (s.submittedAt == 0) revert NotEligibleForReward();

        // Find rank
        uint256 rank = _findRank(roundId, msg.sender);
        if (rank >= 10) revert NotEligibleForReward(); // top 10 only

        uint256 share = r.rewardPool / 10;

        claimed[roundId][msg.sender] = true;
        emit RewardClaimed(roundId, msg.sender, share);

        (bool ok, ) = payable(msg.sender).call{value: share}("");
        require(ok, "transfer failed");
    }

    // -------- Views --------

    function getLeaderboard(uint256 roundId, uint256 topN)
        external
        view
        returns (address[] memory wallets, int64[] memory pnls)
    {
        address[] storage submitters = roundSubmitters[roundId];
        uint256 n = submitters.length < topN ? submitters.length : topN;
        wallets = new address[](n);
        pnls = new int64[](n);

        // Sort top-N (insertion-sort over the whole list; fine for workshop-scale)
        address[] memory sorted = _sortedSubmitters(roundId);
        for (uint256 i = 0; i < n; i++) {
            wallets[i] = sorted[i];
            pnls[i] = submissions[roundId][sorted[i]].pnlUsdtX1e8;
        }
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getSubmissionCount(uint256 roundId) external view returns (uint256) {
        return roundSubmitters[roundId].length;
    }

    // -------- Internal --------

    function _encode(int64 valueX1e8) internal pure returns (uint256) {
        // Encoding must match the Noir circuit's PNL_OFFSET = 1e18.
        int256 shifted = int256(valueX1e8) + 1e18;
        require(shifted > 0, "encoded value must be positive");
        return uint256(shifted);
    }

    function _findRank(uint256 roundId, address who) internal view returns (uint256) {
        address[] memory sorted = _sortedSubmitters(roundId);
        for (uint256 i = 0; i < sorted.length; i++) {
            if (sorted[i] == who) return i;
        }
        return type(uint256).max;
    }

    function _sortedSubmitters(uint256 roundId) internal view returns (address[] memory sorted) {
        address[] storage src = roundSubmitters[roundId];
        uint256 n = src.length;
        sorted = new address[](n);
        for (uint256 i = 0; i < n; i++) sorted[i] = src[i];

        // Insertion sort by PnL descending (fine for n ~ a few dozen)
        for (uint256 i = 1; i < n; i++) {
            address cur = sorted[i];
            int64 curPnl = submissions[roundId][cur].pnlUsdtX1e8;
            uint256 j = i;
            while (j > 0 && submissions[roundId][sorted[j - 1]].pnlUsdtX1e8 < curPnl) {
                sorted[j] = sorted[j - 1];
                unchecked { j--; }
            }
            sorted[j] = cur;
        }
    }
}
