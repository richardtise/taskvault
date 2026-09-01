// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TaskVault.sol";
import "../src/TaskVaultPoints.sol";

contract MockUSDG is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") { _mint(msg.sender, 1000000e6); }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

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

    function setUp() public {
        vm.startPrank(admin);

        usdg = new MockUSDG();
        points = new TaskVaultPoints(admin);
        vault = new TaskVault(
            address(points),
            address(usdg),
            treasury,
            admin
        );

        points.grantRole(points.MINTER_ROLE(), address(vault));
        points.grantRole(points.BURNER_ROLE(), address(vault));
        vault.grantRole(vault.VERIFIER_ROLE(), verifier);

        vm.stopPrank();

        usdg.mint(user, 10000e6);
        usdg.mint(referrer, 1000e6);

        vm.prank(user);
        usdg.approve(address(vault), type(uint256).max);
    }

    function test_RegisterFree() public {
        vm.prank(user);
        vault.register(address(0));

        (bool exists,,,,,,,,,) = vault.getUserInfo(user);
        assertTrue(exists);
    }

    function test_RegisterWithReferrer() public {
        vm.prank(referrer);
        vault.register(address(0));

        vm.prank(user);
        vault.register(referrer);

        (,,,,, uint256 refCount,,,,) = vault.getUserInfo(referrer);
        assertEq(refCount, 1);
    }

    function test_CannotSelfRefer() public {
        vm.prank(user);
        vm.expectRevert("Cannot self-refer");
        vault.register(user);
    }

    function test_CompleteTask() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTask(user, keccak256("task1"), 100e18, true);

        (,, uint256 balance,,,, uint256 tasks,,,) = vault.getUserInfo(user);
        assertEq(tasks, 1);
        assertGt(balance, 0);
    }

    function test_CompleteTaskWithModality() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(verifier);
        vault.completeTaskWithModality(user, keccak256("task1"), 100e18, true, ROBOTICS);

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 0); // Not enough tasks for Bronze yet
        assertEq(badge.tasksCompleted, 1);
    }

    function test_BadgeUpgradeToBronze() public {
        vm.prank(user);
        vault.register(address(0));

        // Complete 20 robotics tasks with 100% accuracy
        for (uint i = 0; i < 20; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 1); // Bronze
        assertEq(badge.tasksCompleted, 20);
    }

    function test_BadgeUpgradeToSilver() public {
        vm.prank(user);
        vault.register(address(0));

        // Complete 100 robotics tasks with 100% accuracy
        for (uint i = 0; i < 100; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        TaskVault.Badge memory badge = vault.getBadge(user, ROBOTICS);
        assertEq(uint256(badge.level), 2); // Silver
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

        // Find robotics badge
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

        // User is Scout (tier 0), no badge
        bool canAccess = vault.canAccessTask(user, 0, ROBOTICS, 0);
        assertTrue(canAccess);

        // Requires Bronze in Robotics
        canAccess = vault.canAccessTask(user, 0, ROBOTICS, 1);
        assertFalse(canAccess);

        // Earn Bronze
        for (uint i = 0; i < 20; i++) {
            vm.prank(verifier);
            vault.completeTaskWithModality(user, keccak256(abi.encode(i)), 10e18, true, ROBOTICS);
        }

        canAccess = vault.canAccessTask(user, 0, ROBOTICS, 1);
        assertTrue(canAccess);
    }

    function test_VaultDeposit() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(500e6);

        (,,,,,,, uint256 vBal, uint256 vMult,) = vault.getUserInfo(user);
        assertEq(vBal, 500e6);
        assertEq(vMult, 5000); // +0.5x
    }

    function test_VaultWithdraw() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(500e6);

        vm.prank(user);
        vault.withdrawFromVault(200e6);

        (,,,,,,, uint256 vBal,,) = vault.getUserInfo(user);
        assertEq(vBal, 300e6);
    }

    function test_CreateStream() public {
        vm.prank(user);
        vault.register(address(0));

        vm.prank(user);
        vault.depositToVault(1000e6);

        vm.prank(user);
        vault.createStream(500e6, 90 days);

        (,,,,,,,,, uint256 streams) = vault.getUserInfo(user);
        assertEq(streams, 1);
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
    }

    function test_TierUpgrade() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 50; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 10e18, true);
        }

        (, uint8 tier,,,,,,,,) = vault.getUserInfo(user);
        assertEq(tier, 1); // Operator
    }

    function test_ArchitectInvite() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 500; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 10e18, true);
        }

        (, uint8 tier,,,,,,,,) = vault.getUserInfo(user);
        assertEq(tier, 3); // Expert

        vm.prank(admin);
        vault.inviteArchitect(user);

        (, uint8 newTier,,,,,,,,) = vault.getUserInfo(user);
        assertEq(newTier, 4); // Architect
    }

    function test_WeeklyCap() public {
        vm.prank(user);
        vault.register(address(0));

        for (uint i = 0; i < 10; i++) {
            vm.prank(verifier);
            vault.completeTask(user, keccak256(abi.encode(i)), 100e18, true);
        }

        (,, uint256 balance,,,,,,,) = vault.getUserInfo(user);
        assertLe(balance, 500e18);
    }

    function test_ReferralEarnings() public {
        vm.prank(referrer);
        vault.register(address(0));

        vm.prank(user);
        vault.register(referrer);

        vm.prank(verifier);
        vault.completeTask(user, keccak256("task1"), 100e18, true);

        (,,,, uint256 refEarnings,,,,,) = vault.getUserInfo(referrer);
        assertGt(refEarnings, 0);
    }

    function test_GetRegisteredModalities() public {
        bytes32[] memory mods = vault.getRegisteredModalities();
        assertGe(mods.length, 6); // At least the 6 default modalities
    }

    function test_RegisterNewModality() public {
        bytes32 newMod = keccak256("game-ai");

        vm.prank(admin);
        vault.registerModality(newMod, "Game AI");

        bytes32[] memory mods = vault.getRegisteredModalities();
        bool found = false;
        for (uint i = 0; i < mods.length; i++) {
            if (mods[i] == newMod) found = true;
        }
        assertTrue(found);
    }
}
