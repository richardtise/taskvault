// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./TaskVaultPoints.sol";

/// @title TaskVault
/// @notice Main contract for TaskVault — free registration, task completion, tiers, badges, referrals, vault, and streaming.
contract TaskVault is AccessControl, ReentrancyGuard {

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // --- Enums ---

    enum BadgeLevel { None, Bronze, Silver, Gold, Platinum }

    // --- Structs ---

    struct Tier {
        string name;
        uint256 minTasks;
        uint256 minAccuracy; // basis points (e.g. 8500 = 85%)
        uint256 multiplier;  // basis points (e.g. 15000 = 1.5x)
    }

    struct Badge {
        BadgeLevel level;
        uint256 tasksCompleted;
        uint256 tasksCorrect;
        uint256 lastUpgraded;
    }

    struct User {
        bool exists;
        uint8 tierIndex;
        uint256 balance;           // TVP points
        uint256 lifetimeEarned;
        uint256 referralEarnings;
        uint256 referralCount;
        uint256 tasksCompleted;
        uint256 tasksCorrect;
        uint256 vaultBalance;      // USDG deposited
        uint256 vaultMultiplier;   // bonus multiplier (basis points)
        uint256 activeStreams;
        address referrer;
        uint256 lastWeeklyReset;
        uint256 weeklyPoints;      // points earned this week
    }

    struct Stream {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 endTime;
        bool cancelled;
    }

    // --- State ---

    TaskVaultPoints public pointsToken;
    IERC20 public usdg;
    address public treasury;

    Tier[] public tiers;
    mapping(address => User) public users;
    mapping(address => Stream[]) public userStreams;
    mapping(address => bool) public isArchitect; // invite-only tier 5

    // Anti-replay: a given worker can only complete a given taskId once
    mapping(address => mapping(bytes32 => bool)) public completedTasks;

    // Leaderboard: every registered user, scored by lifetimeEarned
    address[] public registeredUsers;

    // Horizontal badge system: user -> modalityHash -> badge
    // NOTE: modalityHash MUST be keccak256(modalityName), e.g. keccak256("robotics")
    mapping(address => mapping(bytes32 => Badge)) public userBadges;
    bytes32[] public registeredModalities;
    mapping(bytes32 => bool) public isModalityRegistered;

    // Badge thresholds per level (tasks, accuracy BP)
    uint256[4] public badgeTaskThresholds = [20, 100, 250, 500];
    uint256[4] public badgeAccuracyThresholds = [8500, 9000, 9500, 9800];

    uint256 public constant WEEK = 7 days;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant REFERRAL_SHARE_BP = 500; // 5%
    uint256 public constant MAX_REFERRALS = 50;
    uint256 public constant MIN_ACCURACY_PENALTY = 7000; // 70%
    uint256 public constant PENALTY_MULTIPLIER = 5000; // 50% of points

    // Vault bonus thresholds
    uint256[4] public vaultThresholds = [100e6, 500e6, 2000e6, 5000e6]; // in USDG (6 decimals)
    uint256[4] public vaultBonuses = [2500, 5000, 10000, 20000]; // +0.25x, +0.5x, +1.0x, +2.0x

    // Weekly caps per tier
    uint256[5] public weeklyCaps = [
        500e18,    // Scout: 500 pts
        1500e18,   // Operator
        3000e18,   // Specialist
        5000e18,   // Expert
        10000e18   // Architect
    ];

    // --- Events ---

    event Registered(address indexed user, address indexed referrer);
    event TaskCompleted(address indexed user, bytes32 indexed taskId, uint256 points, bool correct);
    event TaskCompletedWithModality(address indexed user, bytes32 indexed taskId, bytes32 indexed modality, uint256 points);
    event TierUpgraded(address indexed user, uint8 newTier);
    event BadgeUpgraded(address indexed user, bytes32 indexed modality, BadgeLevel newLevel);
    event VaultDeposit(address indexed user, uint256 amount);
    event VaultWithdraw(address indexed user, uint256 amount);
    event StreamCreated(address indexed user, uint256 index, uint256 amount, uint256 duration);
    event StreamClaimed(address indexed user, uint256 index, uint256 amount);
    event StreamCancelled(address indexed user, uint256 index, uint256 forfeited);
    event ArchitectInvited(address indexed user);
    event ModalityRegistered(bytes32 indexed modality, string name);

    // --- Constructor ---

    constructor(
        address _pointsToken,
        address _usdg,
        address _treasury,
        address _admin
    ) {
        pointsToken = TaskVaultPoints(_pointsToken);
        usdg = IERC20(_usdg);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(VERIFIER_ROLE, _admin);

        // Initialize tiers
        tiers.push(Tier("Scout", 0, 0, 10000));        // 1.0x
        tiers.push(Tier("Operator", 50, 8500, 15000));  // 1.5x
        tiers.push(Tier("Specialist", 200, 9000, 25000)); // 2.5x
        tiers.push(Tier("Expert", 500, 9500, 40000));   // 4.0x
        tiers.push(Tier("Architect", type(uint256).max, 9800, 60000)); // 6.0x, invite-only

        // Register default modalities (keccak256 of the modality name —
        // the backend MUST use the same convention: ethers.id(name))
        _registerModality(keccak256("robotics"), "Robotics");
        _registerModality(keccak256("llm"), "LLM Evaluation");
        _registerModality(keccak256("vision"), "Computer Vision");
        _registerModality(keccak256("audio"), "Audio Processing");
        _registerModality(keccak256("writing"), "Writing & Research");
        _registerModality(keccak256("safety"), "Safety & Redteam");
        _registerModality(keccak256("medical"), "Medical Imaging");
    }

    // --- Modality Management ---

    function _registerModality(bytes32 modalityHash, string memory name) internal {
        if (!isModalityRegistered[modalityHash]) {
            isModalityRegistered[modalityHash] = true;
            registeredModalities.push(modalityHash);
            emit ModalityRegistered(modalityHash, name);
        }
    }

    /// @notice Register a modality. `_modalityHash` must equal keccak256(name).
    function registerModality(bytes32 modalityHash, string memory name) external onlyRole(ADMIN_ROLE) {
        require(modalityHash == keccak256(bytes(name)), "Hash must equal keccak256(name)");
        _registerModality(modalityHash, name);
    }

    function getRegisteredModalities() external view returns (bytes32[] memory) {
        return registeredModalities;
    }

    // --- Registration ---

    function register(address referrer) external {
        require(!users[msg.sender].exists, "Already registered");
        require(referrer != msg.sender, "Cannot self-refer");

        User storage user = users[msg.sender];
        user.exists = true;
        user.tierIndex = 0;
        user.lastWeeklyReset = block.timestamp;

        registeredUsers.push(msg.sender);

        if (referrer != address(0) && users[referrer].exists && users[referrer].referralCount < MAX_REFERRALS) {
            user.referrer = referrer;
            users[referrer].referralCount++;
        }

        emit Registered(msg.sender, referrer);
    }

    // --- Task Completion ---

    /// @notice Complete a generic task (no modality tracking).
    function completeTask(address worker, bytes32 taskId, uint256 basePoints, bool correct) external onlyRole(VERIFIER_ROLE) {
        _processTaskCompletion(worker, taskId, basePoints, correct, bytes32(0));
    }

    /// @notice Complete a task with modality tracking for badges.
    /// @param modality keccak256(modalityName), must be registered.
    function completeTaskWithModality(
        address worker, 
        bytes32 taskId, 
        uint256 basePoints, 
        bool correct,
        bytes32 modality
    ) external onlyRole(VERIFIER_ROLE) {
        require(isModalityRegistered[modality], "Unregistered modality");
        _processTaskCompletion(worker, taskId, basePoints, correct, modality);
    }

    function _processTaskCompletion(
        address worker, 
        bytes32 taskId, 
        uint256 basePoints, 
        bool correct,
        bytes32 modality
    ) internal {
        require(users[worker].exists, "Worker not registered");
        require(!completedTasks[worker][taskId], "Task already completed");
        completedTasks[worker][taskId] = true;

        User storage user = users[worker];
        user.tasksCompleted++;
        if (correct) user.tasksCorrect++;

        // Update modality badge stats for EVERY attempt (correct or not),
        // so accuracy reflects real reliability.
        if (modality != bytes32(0)) {
            _updateBadge(worker, modality, correct);
        }

        // Check weekly cap
        if (block.timestamp >= user.lastWeeklyReset + WEEK) {
            user.lastWeeklyReset = block.timestamp;
            user.weeklyPoints = 0;
        }

        // Calculate points with multipliers
        uint256 earned = _calculatePoints(worker, basePoints, correct);

        // Apply weekly cap
        uint256 cap = weeklyCaps[user.tierIndex];
        if (user.weeklyPoints + earned > cap) {
            earned = cap - user.weeklyPoints;
        }

        if (earned > 0) {
            user.weeklyPoints += earned;
            user.balance += earned;
            user.lifetimeEarned += earned;
            pointsToken.mint(worker, earned);

            // Referral bonus
            if (user.referrer != address(0)) {
                uint256 refBonus = (earned * REFERRAL_SHARE_BP) / BASIS_POINTS;
                users[user.referrer].referralEarnings += refBonus;
                users[user.referrer].balance += refBonus;
                pointsToken.mint(user.referrer, refBonus);
            }
        }

        // Auto-upgrade tier
        _checkTierUpgrade(worker);

        emit TaskCompleted(worker, taskId, earned, correct);
        if (modality != bytes32(0)) {
            emit TaskCompletedWithModality(worker, taskId, modality, earned);
        }
    }

    // --- Badge System ---

    function _updateBadge(address user, bytes32 modality, bool correct) internal {
        Badge storage badge = userBadges[user][modality];
        badge.tasksCompleted++;
        if (correct) badge.tasksCorrect++;

        // Check for badge upgrade
        BadgeLevel currentLevel = badge.level;
        BadgeLevel newLevel = currentLevel;

        for (uint i = uint(currentLevel); i < 4; i++) {
            uint256 requiredTasks = badgeTaskThresholds[i];
            uint256 requiredAccuracy = badgeAccuracyThresholds[i];

            if (badge.tasksCompleted >= requiredTasks) {
                uint256 accuracy = (badge.tasksCorrect * BASIS_POINTS) / badge.tasksCompleted;
                if (accuracy >= requiredAccuracy) {
                    newLevel = BadgeLevel(i + 1);
                }
            }
        }

        if (newLevel != currentLevel) {
            badge.level = newLevel;
            badge.lastUpgraded = block.timestamp;
            emit BadgeUpgraded(user, modality, newLevel);
        }
    }

    function getBadge(address user, bytes32 modality) external view returns (Badge memory) {
        return userBadges[user][modality];
    }

    function getAllBadges(address user) external view returns (bytes32[] memory modalities, Badge[] memory badges) {
        uint256 count = registeredModalities.length;
        modalities = new bytes32[](count);
        badges = new Badge[](count);

        for (uint i = 0; i < count; i++) {
            bytes32 mod = registeredModalities[i];
            modalities[i] = mod;
            badges[i] = userBadges[user][mod];
        }
    }

    function canAccessTask(address user, uint8 requiredTier, bytes32 requiredModality, BadgeLevel requiredBadge) external view returns (bool) {
        if (!users[user].exists) return false;
        if (users[user].tierIndex < requiredTier) return false;
        if (requiredModality != bytes32(0) && userBadges[user][requiredModality].level < requiredBadge) return false;
        return true;
    }

    // --- Points Calculation ---

    function _calculatePoints(address worker, uint256 base, bool correct) internal view returns (uint256) {
        User storage user = users[worker];

        if (!correct) return base / 2;

        uint256 tierMult = tiers[user.tierIndex].multiplier;
        uint256 vaultMult = user.vaultMultiplier;
        uint256 totalMult = tierMult + vaultMult;

        uint256 points = (base * totalMult) / BASIS_POINTS;

        if (user.tasksCompleted > 10) {
            uint256 accuracy = (user.tasksCorrect * BASIS_POINTS) / user.tasksCompleted;
            if (accuracy < MIN_ACCURACY_PENALTY) {
                points = (points * PENALTY_MULTIPLIER) / BASIS_POINTS;
            }
        }

        return points;
    }

    function _checkTierUpgrade(address worker) internal {
        User storage user = users[worker];
        uint8 current = user.tierIndex;

        for (uint8 i = current + 1; i < tiers.length; i++) {
            Tier storage t = tiers[i];
            if (i == 4) break; // Architect is invite-only

            if (user.tasksCompleted >= t.minTasks) {
                uint256 accuracy = user.tasksCompleted > 0 
                    ? (user.tasksCorrect * BASIS_POINTS) / user.tasksCompleted 
                    : BASIS_POINTS;
                if (accuracy >= t.minAccuracy) {
                    user.tierIndex = i;
                    emit TierUpgraded(worker, i);
                }
            }
        }
    }

    // --- Vault ---

    function depositToVault(uint256 amount) external nonReentrant {
        require(users[msg.sender].exists, "Not registered");
        require(amount > 0, "Zero amount");

        usdg.transferFrom(msg.sender, address(this), amount);

        User storage user = users[msg.sender];
        user.vaultBalance += amount;

        _updateVaultMultiplier(msg.sender);

        emit VaultDeposit(msg.sender, amount);
    }

    function withdrawFromVault(uint256 amount) external nonReentrant {
        User storage user = users[msg.sender];
        require(user.vaultBalance >= amount, "Insufficient balance");

        user.vaultBalance -= amount;
        usdg.transfer(msg.sender, amount);

        _updateVaultMultiplier(msg.sender);

        emit VaultWithdraw(msg.sender, amount);
    }

    function _updateVaultMultiplier(address user) internal {
        uint256 balance = users[user].vaultBalance;
        uint256 bonus = 0;

        for (uint i = 0; i < vaultThresholds.length; i++) {
            if (balance >= vaultThresholds[i]) {
                bonus = vaultBonuses[i];
            }
        }

        users[user].vaultMultiplier = bonus;
    }

    // --- Streaming ---

    function createStream(uint256 amount, uint256 durationSeconds) external nonReentrant {
        require(users[msg.sender].exists, "Not registered");
        require(amount > 0, "Zero amount");
        require(durationSeconds >= 1 days, "Min 1 day");

        User storage user = users[msg.sender];
        require(user.vaultBalance >= amount, "Insufficient vault balance");

        user.vaultBalance -= amount;
        user.activeStreams++;

        userStreams[msg.sender].push(Stream({
            totalAmount: amount,
            claimedAmount: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + durationSeconds,
            cancelled: false
        }));

        emit StreamCreated(msg.sender, userStreams[msg.sender].length - 1, amount, durationSeconds);
    }

    function claimStream(uint256 streamIndex) external nonReentrant {
        Stream storage stream = userStreams[msg.sender][streamIndex];
        require(!stream.cancelled, "Stream cancelled");
        require(block.timestamp > stream.startTime, "Not started");

        uint256 vested = _vestedAmount(stream);
        uint256 claimable = vested - stream.claimedAmount;
        require(claimable > 0, "Nothing to claim");

        stream.claimedAmount += claimable;
        usdg.transfer(msg.sender, claimable);

        emit StreamClaimed(msg.sender, streamIndex, claimable);
    }

    function cancelStream(uint256 streamIndex) external nonReentrant {
        Stream storage stream = userStreams[msg.sender][streamIndex];
        require(!stream.cancelled, "Already cancelled");

        uint256 vested = _vestedAmount(stream);
        uint256 claimable = vested - stream.claimedAmount;
        uint256 forfeited = stream.totalAmount - vested;

        stream.cancelled = true;
        users[msg.sender].activeStreams--;

        if (claimable > 0) {
            stream.claimedAmount += claimable;
            usdg.transfer(msg.sender, claimable);
        }

        if (forfeited > 0) {
            usdg.transfer(treasury, forfeited);
        }

        emit StreamCancelled(msg.sender, streamIndex, forfeited);
    }

    function _vestedAmount(Stream memory stream) internal view returns (uint256) {
        if (block.timestamp >= stream.endTime) return stream.totalAmount;
        if (block.timestamp <= stream.startTime) return 0;

        uint256 duration = stream.endTime - stream.startTime;
        uint256 elapsed = block.timestamp - stream.startTime;
        return (stream.totalAmount * elapsed) / duration;
    }

    // --- Architect ---

    function inviteArchitect(address user) external onlyRole(ADMIN_ROLE) {
        require(users[user].exists, "Not registered");
        require(users[user].tierIndex == 3, "Must be Expert first");

        isArchitect[user] = true;
        users[user].tierIndex = 4;

        emit ArchitectInvited(user);
        emit TierUpgraded(user, 4);
    }

    // --- View Functions ---

    function getUserInfo(address user) external view returns (
        bool exists,
        uint8 tierIndex,
        uint256 balance,
        uint256 lifetimeEarned,
        uint256 referralEarnings,
        uint256 referralCount,
        uint256 tasksCompleted,
        uint256 tasksCorrect,
        uint256 vaultBalance,
        uint256 vaultMultiplier,
        uint256 activeStreams
    ) {
        User storage u = users[user];
        return (
            u.exists,
            u.tierIndex,
            u.balance,
            u.lifetimeEarned,
            u.referralEarnings,
            u.referralCount,
            u.tasksCompleted,
            u.tasksCorrect,
            u.vaultBalance,
            u.vaultMultiplier,
            u.activeStreams
        );
    }

    function getTierCount() external view returns (uint256) {
        return tiers.length;
    }

    /// @notice Returns the top `count` registered users by lifetimeEarned.
    /// @dev O(n) view — fine for moderate user counts; for large N use an off-chain indexer.
    function getLeaderboard(uint256 count) external view returns (address[] memory, uint256[] memory) {
        uint256 n = registeredUsers.length;
        uint256 m = count < n ? count : n;

        address[] memory addrs = new address[](m);
        uint256[] memory scores = new uint256[](m);

        // Working copies for selection sort
        address[] memory tmpA = new address[](n);
        uint256[] memory tmpS = new uint256[](n);
        for (uint i = 0; i < n; i++) {
            tmpA[i] = registeredUsers[i];
            tmpS[i] = users[registeredUsers[i]].lifetimeEarned;
        }

        for (uint i = 0; i < m; i++) {
            uint256 best = i;
            for (uint j = i + 1; j < n; j++) {
                if (tmpS[j] > tmpS[best]) best = j;
            }
            addrs[i] = tmpA[best];
            scores[i] = tmpS[best];
            tmpA[best] = tmpA[i];
            tmpS[best] = tmpS[i];
        }

        return (addrs, scores);
    }

    function getActiveStreams(address user) external view returns (Stream[] memory) {
        return userStreams[user];
    }

    // --- Admin ---

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
    }

    function addVerifier(address verifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(VERIFIER_ROLE, verifier);
    }

    function removeVerifier(address verifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(VERIFIER_ROLE, verifier);
    }

    function setWeeklyCap(uint8 tier, uint256 cap) external onlyRole(ADMIN_ROLE) {
        require(tier < 5, "Invalid tier");
        weeklyCaps[tier] = cap;
    }

    function setVaultThresholds(uint256[4] memory thresholds, uint256[4] memory bonuses) external onlyRole(ADMIN_ROLE) {
        vaultThresholds = thresholds;
        vaultBonuses = bonuses;
    }

    function setBadgeThresholds(uint256[4] memory tasks, uint256[4] memory accuracy) external onlyRole(ADMIN_ROLE) {
        badgeTaskThresholds = tasks;
        badgeAccuracyThresholds = accuracy;
    }
}
