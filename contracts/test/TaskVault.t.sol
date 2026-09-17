// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TaskVault.sol";
import "../src/TaskVaultPoints.sol";
import "../src/mocks/MockUSDG.sol";

contract TaskVaultTest is Test {
    TaskVaultPoints public points;
    TaskVault public vault;
    MockUSDG public usdg;

    address public admin = address(1);
    address public treasury = address(2);
    address public verifier = address(3);
    address public user = address(4);
    address public referrer = address(5);

    bytes32 public constant ROBOTICS = keccak256("robotics");
    bytes32 public constant LLM = keccak256("llm");

    // getUserInfo() return order, kept here so tests never index by guesswork:
    // 1 exists, 2 tierIndex, 3 balance, 4 lifetimeEarned, 5 referralEarnings,
    // 6 referralCount, 7 tasksCompleted, 8 tasksCorrect, 9 vaultBalance,
    // 10 vaultMultiplier, 11 activeStreams
    struct Info {
        bool exists;
        uint8 tierIndex;
        uint256 balance;
        uint256 lifetimeEarned;
        uint256 referralEarnings;
        uint256 referralCount;
        uint256 tasksCompleted;
        uint256 tasksCorrect;
        uint256 vaultBalance;
        uint256 vaultMultiplier;
        uint256 activeStreams;
    }

    function info(address who) internal view returns (Info memory i) {
        (
            i.exists,
            i.tierIndex,
            i.balance,
            i.lifetimeEarned,
            i.referralEarnings,
            i.referralCount,
            i.tasksCompleted,
            i.tasksCorrect,
            i.vaultBalance,
            i.vaultMultiplier,
            i.activeStreams
        ) = vault.getUserInfo(who);
    }

    /// @dev `referrer` is field 12 of the User struct returned by the public
    ///      `users` mapping getter (getUserInfo does not expose it).
    function referrerOf(address who) internal view returns (address r) {
        (,,,,,,,,,,, r,,) = vault.users(who);
    }

    function setUp() public {
        vm.startPrank(admin);

        usdg = new MockUSDG();
        points = new TaskVaultPoints(admin);
        vault = new TaskVault(address(points), address(usdg), treasury, admin);

        points.grantRole(points.MINTER_ROLE(), address(vault));
        points.grantRole(points.BURNER_ROLE(), address(vault));
        vault.grantRole(vault.VERIFIER_ROLE(), verifier);

        vm.stopPrank();

        usdg.mint(user, 10000e6);
        usdg.mint(referrer, 1000e6);

        vm.prank(user);
        usdg.approve(address(vault), type(uint256).max);
        vm.prank(referrer);
        usdg.approve(address(vault), type(uint256).max);
    }

    // --- Registration ---

    function test_RegisterFree() public {
        vm.prank(user);
        vault.register(address(0));
        assertTrue(info(user).exists);
    }

    function test_RegisterWithReferrer() public {
        vm.prank(referrer);
        vault.register(address(0));

        vm.prank(user);
        vault.register(referrer);

        assertEq(info(referrer).referralCount, 1);
    }

    function test_CannotSelfRefer() public {
        vm.prank(user);
        vm.expectRevert("Cannot self-refer");
        vault.register(user);
    }

    function test_CannotRegisterTwice() public {
        vm.prank(user);
        vault.register(address(0));
        vm.prank(user);
        vm.expectRevert("Already registered");
        vault.register(address(0));
    }

    function test_UnregisteredReferrerIsIgnored() public {
        vm.prank(user);
        vault.register(address(0xDEAD));
        // Referrer was never registered, so no referrer link must be recorded.
        assertEq(referrerOf(user), address(0));
    }

    // --- Task completion ---

    function test_CompleteTask() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTask(user, keccak256("task1"), 100e18, true);

        Info memory i = info(user);
        assertEq(i.tasksCompleted, 1);
        assertEq(i.tasksCorrect, 1);
        assertGt(i.balance, 0);
    }

    function test_CompleteTaskRequiresRegisteredWorker() public {
        vm.prank(verifier);
        vm.expectRevert("Worker not registered");
        vault.completeTask(user, keccak256("task1"), 100e18, true);
    }

    function test_CompleteTaskOnlyVerifier() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vm.expectRevert();
        vault.completeTask(user, keccak256("task1"), 100e18, true);
    }

    function test_CannotCompleteSameTaskTwice() public {
        vm.prank(user);
        vault.register(address(0));

        bytes32 taskId = keccak256("task-replay");

        vm.prank(verifier);
        vault.completeTask(user, taskId, 100e18, true);

        vm.prank(verifier);
        vm.expectRevert("Task already completed");
        vault.completeTask(user, taskId, 100e18, true);
    }

    function test_IncorrectTaskAwardsHalfBasePoints() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTask(user, keccak256("t1"), 100e18, false);

        Info memory i = info(user);
        assertEq(i.tasksCompleted, 1);
        assertEq(i.tasksCorrect, 0);
        assertEq(i.balance, 50e18); // base / 2, no multiplier for incorrect work
    }

    function test_GetUserInfoTracksCorrectTasks() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTask(user, keccak256("t1"), 10e18, true);
        vm.prank(verifier);
        vault.completeTask(user, keccak256("t2"), 10e18, false);

        Info memory i = info(user);
        assertEq(i.tasksCompleted, 2);
        assertEq(i.tasksCorrect, 1);
    }

    // --- Modality / badges ---

    function test_CompleteTaskWithModality() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTaskWithModality(user, keccak256("task1"), 100e18, true, ROBOTICS);

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 0); // Not enough tasks for Bronze yet
        assertEq(badge.tasksCompleted, 1);
        assertEq(badge.tasksCorrect, 1);
    }

    function test_CompleteTaskWithUnregisteredModalityReverts() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vm.expectRevert("Unregistered modality");
        vault.completeTaskWithModality(user, keccak256("task1"), 100e18, true, keccak256("nope"));
    }

    function test_BadgeCountsIncorrectAttempts() public {
        vm.prank(user);
        vault.register(address(0));

        // 1 wrong + 1 correct: tasksCompleted=2, tasksCorrect=1 -> accuracy 50%
        vm.prank(verifier);
        vault.completeTaskWithModality(user, keccak256("w1"), 10e18, false, ROBOTICS);

        vm.prank(verifier);
        vault.completeTaskWithModality(user, keccak256("c1"), 10e18, true, ROBOTICS);

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(badge.tasksCompleted, 2);
        assertEq(badge.tasksCorrect, 1);
    }

    function test_BadgeUpgradeToBronze() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 20; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 1); // Bronze
        assertEq(badge.tasksCompleted, 20);
        assertEq(badge.tasksCorrect, 20);
    }

    function test_BadgeUpgradeToSilver() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 100; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 2); // Silver
    }

    function test_BadgeDoesNotUpgradeBelowAccuracy() public {
        vm.prank(user);
        vault.register(address(0));

        // 20 tasks but only 50% accuracy -> stays None (needs 85% for Bronze).
        for (uint i = 0; i < 20; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, i % 2 == 0, ROBOTICS);
        }

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 0);
    }

    function test_GetAllBadges() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 20; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        (bytes32[] memory modalities, TaskVault.Badge[] memory badges) = vault.getAllBadges(user);
        assertGt(modalities.length, 0);

        bool found = false;
        for (uint i = 0; i < modalities.length; i++) {
            if (modalities[i] == ROBOTICS) {
                assertEq(uint256(badges[i].level), 1); // Bronze
                found = true;
            }
        }
        assertTrue(found);
    }

    function test_CanAccessTask() public {
        vm.prank(user);
        vault.register(address(0));

        assertTrue(vault.canAccessTask(user, 0, ROBOTICS, TaskVault.BadgeLevel.None));
        assertFalse(vault.canAccessTask(user, 0, ROBOTICS, TaskVault.BadgeLevel.Bronze));

        for (uint i = 0; i < 20; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        assertTrue(vault.canAccessTask(user, 0, ROBOTICS, TaskVault.BadgeLevel.Bronze));
    }

    function test_CanAccessTaskRejectsUnregistered() public {
        assertFalse(vault.canAccessTask(user, 0, bytes32(0), TaskVault.BadgeLevel.None));
    }

    // --- Modality registry ---

    function test_GetRegisteredModalities() public {
        bytes32[] memory mods = vault.getRegisteredModalities();
        assertEq(mods.length, 7);
    }

    function test_RegisterNewModality() public {
        string memory name = "game-ai";
        bytes32 newMod = keccak256(bytes(name));

        vm.prank(admin);
        vault.registerModality(newMod, name);

        bytes32[] memory mods = vault.getRegisteredModalities();
        bool found = false;
        for (uint i = 0; i < mods.length; i++) {
            if (mods[i] == newMod) found = true;
        }
        assertTrue(found);
    }

    function test_RegisterModalityRejectsBadHash() public {
        vm.prank(admin);
        vm.expectRevert("Hash must equal keccak256(name)");
        vault.registerModality(bytes32(uint256(12345)), "game-ai");
    }

    // --- Vault ---

    function test_VaultDeposit() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(500e6);

        Info memory i = info(user);
        assertEq(i.vaultBalance, 500e6);
        assertEq(i.vaultMultiplier, 5000); // +0.5x
    }

    function test_VaultDepositTiers() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(100e6);
        assertEq(info(user).vaultMultiplier, 2500);

        vm.prank(user);
        vault.depositToVault(400e6); // 500e6 total
        assertEq(info(user).vaultMultiplier, 5000);

        vm.prank(user);
        vault.depositToVault(1500e6); // 2000e6 total
        assertEq(info(user).vaultMultiplier, 10000);

        vm.prank(user);
        vault.depositToVault(3000e6); // 5000e6 total
        assertEq(info(user).vaultMultiplier, 20000);
    }

    function test_VaultWithdraw() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(500e6);

        vm.prank(user);
        vault.withdrawFromVault(200e6);

        Info memory i = info(user);
        assertEq(i.vaultBalance, 300e6);
        assertEq(i.vaultMultiplier, 2500); // 300e6 is below the 500e6 tier
    }

    function test_VaultWithdrawUnregisteredReverts() public {
        vm.prank(user);
        vm.expectRevert("Not registered");
        vault.withdrawFromVault(0);
    }

    function test_VaultDepositRequiresApproval() public {
        vm.prank(user);
        vault.register(address(0));
        vm.prank(user);
        usdg.approve(address(vault), 0);

        vm.prank(user);
        vm.expectRevert();
        vault.depositToVault(100e6);
    }

    // --- Streaming ---

    function test_CreateStream() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(1000e6);

        vm.prank(user);
        vault.createStream(500e6, 90 days);

        assertEq(info(user).activeStreams, 1);
    }

    function test_CreateStreamUpdatesVaultMultiplier() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(2000e6);
        assertEq(info(user).vaultMultiplier, 10000); // +1.0x at 2000e6

        // Streaming most of it out must drop the bonus back down.
        vm.prank(user);
        vault.createStream(1900e6, 90 days);
        assertEq(info(user).vaultBalance, 100e6);
        assertEq(info(user).vaultMultiplier, 2500);
    }

    function test_ClaimStream() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(1000e6);

        vm.prank(user);
        vault.createStream(500e6, 90 days);

        vm.warp(block.timestamp + 45 days);

        uint256 preBal = usdg.balanceOf(user);

        vm.prank(user);
        vault.claimStream(0);

        uint256 postBal = usdg.balanceOf(user);
        assertApproxEqRel(postBal - preBal, 250e6, 0.01e18);
        assertEq(info(user).activeStreams, 1); // still vesting
    }

    function test_FullyClaimedStreamIsNoLongerActive() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(1000e6);

        vm.prank(user);
        vault.createStream(500e6, 90 days);
        assertEq(info(user).activeStreams, 1);

        vm.warp(block.timestamp + 90 days);

        vm.prank(user);
        vault.claimStream(0);

        assertEq(info(user).activeStreams, 0);

        // Second claim must revert rather than double-decrement.
        vm.prank(user);
        vm.expectRevert("Nothing to claim");
        vault.claimStream(0);
    }

    function test_CancelStreamForfeitsUnvestedToTreasury() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(1000e6);

        vm.prank(user);
        vault.createStream(500e6, 90 days);

        vm.warp(block.timestamp + 45 days);

        uint256 treasuryBefore = usdg.balanceOf(treasury);
        uint256 userBefore = usdg.balanceOf(user);

        vm.prank(user);
        vault.cancelStream(0);

        assertApproxEqRel(usdg.balanceOf(treasury) - treasuryBefore, 250e6, 0.01e18);
        assertApproxEqRel(usdg.balanceOf(user) - userBefore, 250e6, 0.01e18);
        assertEq(info(user).activeStreams, 0);

        vm.prank(user);
        vm.expectRevert("Already cancelled");
        vault.cancelStream(0);
    }

    function test_CreateStreamRequiresMinimumDuration() public {
        vm.prank(user);
        vault.register(address(0));
        vm.prank(user);
        vault.depositToVault(100e6);

        vm.prank(user);
        vm.expectRevert("Min 1 day");
        vault.createStream(50e6, 1 hours);
    }

    function testFuzz_ClaimStreamNeverExceedsTotal(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 180 days);

        vm.prank(user);
        vault.register(address(0));
        vm.prank(user);
        vault.depositToVault(1000e6);
        vm.prank(user);
        vault.createStream(500e6, 90 days);

        vm.warp(block.timestamp + elapsed);

        uint256 before = usdg.balanceOf(user);
        vm.prank(user);
        try vault.claimStream(0) {
            uint256 claimed = usdg.balanceOf(user) - before;
            assertLe(claimed, 500e6, "claimed more than streamed");
        } catch {
            // Nothing to claim before the stream starts; acceptable.
        }
    }

    // --- Tiers ---

    function test_TierUpgrade() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 50; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 10e18, true);
        }

        assertEq(info(user).tierIndex, 1); // Operator
    }

    function test_ArchitectInvite() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 500; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 10e18, true);
        }

        assertEq(info(user).tierIndex, 3); // Expert — Architect is invite-only

        vm.prank(admin);
        vault.inviteArchitect(user);

        assertEq(info(user).tierIndex, 4); // Architect
    }

    function test_ArchitectInviteRequiresExpert() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(admin);
        vm.expectRevert("Must be Expert first");
        vault.inviteArchitect(user);
    }

    function test_AutoUpgradeNeverReachesArchitect() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 600; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 10e18, true);
        }

        assertEq(info(user).tierIndex, 3);
    }

    // --- Weekly cap ---

    function test_WeeklyCap() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 10; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 100e18, true);
        }

        assertEq(info(user).balance, 500e18); // Scout cap
    }

    function test_WeeklyCapResetsAfterAWeek() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 10; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 100e18, true);
        }
        assertEq(info(user).balance, 500e18);

        vm.warp(block.timestamp + 8 days);

        vm.prank(verifier);
        vault.completeTask(user, keccak256("after-reset"), 100e18, true);

        assertEq(info(user).balance, 600e18);
    }

    /// @dev Regression: lowering a cap below a user's already-earned weeklyPoints
    ///      used to underflow and revert every subsequent completion.
    function test_LoweredWeeklyCapDoesNotBrickCompletions() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 5; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 100e18, true);
        }
        uint256 balanceBefore = info(user).balance;
        assertEq(balanceBefore, 500e18);

        // Admin drops the Scout cap below what the user already earned this week.
        vm.prank(admin);
        vault.setWeeklyCap(0, 100e18);

        // Must not revert (previously underflowed) and must award nothing more.
        vm.prank(verifier);
        vault.completeTask(user, keccak256("after-cap-drop"), 100e18, true);

        assertEq(info(user).balance, balanceBefore);
    }

    // --- Referrals ---

    function test_ReferralEarnings() public {
        vm.prank(referrer);
        vault.register(address(0));

        vm.prank(user);
        vault.register(referrer);

        vm.prank(verifier);
        vault.completeTask(user, keccak256("task1"), 100e18, true);

        assertGt(info(referrer).referralEarnings, 0);
    }

    function test_ReferralCountCappedAtMax() public {
        vm.prank(referrer);
        vault.register(address(0));

        for (uint i = 0; i < 55; i++) {
            address r = address(uint160(1000 + i));
            vm.prank(r);
            vault.register(referrer);
        }

        assertEq(info(referrer).referralCount, 50); // MAX_REFERRALS
    }

    // --- Leaderboard ---

    function test_Leaderboard() public {
        vm.prank(user);
        vault.register(address(0));
        vm.prank(referrer);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTask(user, keccak256("t1"), 100e18, true);

        (address[] memory addrs, uint256[] memory scores) = vault.getLeaderboard(10);
        assertEq(addrs.length, 2);
        assertEq(addrs[0], user);
        assertGt(scores[0], scores[1]);
    }

    function test_LeaderboardHandlesCountAboveUserTotal() public {
        vm.prank(user);
        vault.register(address(0));

        (address[] memory addrs, ) = vault.getLeaderboard(50);
        assertEq(addrs.length, 1);
    }
}
