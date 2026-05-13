// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {Competition} from "../src/Competition.sol";
import {MockZkVerify} from "../src/MockZkVerify.sol";

contract CompetitionTest is Test {
    Competition c;
    MockZkVerify mockZk;
    address owner = address(this);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    uint64 constant PERIOD_START = 1_717_200_000_000;
    uint64 constant PERIOD_END   = 1_717_804_800_000;
    int64  constant THRESHOLD    = 500 * 1e8; // 500 USDT
    uint256 constant REWARD_POOL = 1 ether;

    function setUp() public {
        mockZk = new MockZkVerify();
        c = new Competition(address(mockZk));
        vm.deal(owner, 100 ether);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
    }

    function _createRound() internal returns (uint256 roundId) {
        roundId = c.createRound{value: REWARD_POOL}(
            PERIOD_START, PERIOD_END, THRESHOLD, REWARD_POOL
        );
    }

    function _submitAs(
        address user,
        uint256 roundId,
        int64 pnl,
        bytes32 uidBinding,
        bytes32 commitment
    ) internal {
        uint256 thresholdEncoded = uint256(int256(THRESHOLD) + 1e18);
        bytes32 attId = keccak256(abi.encode(user, pnl));
        bytes32 digest = keccak256(abi.encode(
            thresholdEncoded,
            PERIOD_START,
            PERIOD_END,
            user,
            uidBinding,
            commitment
        ));
        mockZk.registerAttestation(attId, digest);

        vm.prank(user);
        c.submitProof(
            roundId, attId, thresholdEncoded,
            PERIOD_START, PERIOD_END, user,
            uidBinding, commitment, pnl
        );
    }

    function test_CreateRound() public {
        uint256 roundId = _createRound();
        Competition.Round memory r = c.getRound(roundId);
        assertEq(r.periodStart, PERIOD_START);
        assertEq(r.rewardPool, REWARD_POOL);
        assertTrue(r.active);
    }

    function test_SubmitProofSucceeds() public {
        uint256 roundId = _createRound();
        _submitAs(alice, roundId, 1000 * 1e8, bytes32("uid-alice"), bytes32("comm-alice"));
        assertEq(c.getSubmissionCount(roundId), 1);
    }

    function test_PublicInputMismatchReverts() public {
        uint256 roundId = _createRound();
        uint256 thresholdEncoded = uint256(int256(THRESHOLD) + 1e18);
        bytes32 attId = keccak256("att");
        bytes32 digest = keccak256(abi.encode(
            thresholdEncoded, PERIOD_START, PERIOD_END, alice,
            bytes32("uid"), bytes32("comm")
        ));
        mockZk.registerAttestation(attId, digest);

        vm.prank(alice);
        vm.expectRevert(Competition.PublicInputMismatch.selector);
        c.submitProof(
            roundId, attId, thresholdEncoded,
            PERIOD_START + 1, // wrong!
            PERIOD_END, alice,
            bytes32("uid"), bytes32("comm"), 1000 * 1e8
        );
    }

    function test_SameUidCannotSubmitTwice() public {
        uint256 roundId = _createRound();
        bytes32 sharedUid = bytes32("shared-uid");

        _submitAs(alice, roundId, 1000 * 1e8, sharedUid, bytes32("comm-1"));

        // Bob tries to reuse the same UID hash
        uint256 thresholdEncoded = uint256(int256(THRESHOLD) + 1e18);
        bytes32 attId = keccak256("att-bob");
        bytes32 digest = keccak256(abi.encode(
            thresholdEncoded, PERIOD_START, PERIOD_END, bob,
            sharedUid, bytes32("comm-2")
        ));
        mockZk.registerAttestation(attId, digest);

        vm.prank(bob);
        vm.expectRevert(Competition.UidAlreadyUsed.selector);
        c.submitProof(
            roundId, attId, thresholdEncoded,
            PERIOD_START, PERIOD_END, bob,
            sharedUid, bytes32("comm-2"), 2000 * 1e8
        );
    }

    function test_LeaderboardSortsByPnl() public {
        uint256 roundId = _createRound();
        _submitAs(alice, roundId, 500 * 1e8, bytes32("uid-a"), bytes32("comm-a"));
        _submitAs(bob,   roundId, 2000 * 1e8, bytes32("uid-b"), bytes32("comm-b"));

        (address[] memory wallets, int64[] memory pnls) = c.getLeaderboard(roundId, 10);
        assertEq(wallets[0], bob);
        assertEq(wallets[1], alice);
        assertEq(pnls[0], 2000 * 1e8);
        assertEq(pnls[1], 500 * 1e8);
    }

    function test_ClaimRewardAfterFinalize() public {
        uint256 roundId = _createRound();
        _submitAs(alice, roundId, 1000 * 1e8, bytes32("uid-a"), bytes32("comm-a"));
        c.finalizeRound(roundId);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        c.claimReward(roundId);
        assertGt(alice.balance, balBefore);
    }
}
