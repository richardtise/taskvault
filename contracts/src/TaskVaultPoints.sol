// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TaskVaultPoints
/// @notice Soulbound point token for TaskVault. Non-transferable by default.
contract TaskVaultPoints is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 100M points
    bool public transfersEnabled = false;

    mapping(address => bool) public transferWhitelist;

    event TransfersEnabled();
    event TransferWhitelisted(address indexed account, bool status);

    constructor(address admin) ERC20("TaskVault Points", "TVP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
    }

    /// @notice Mint points to a user. Only minter role.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Max supply exceeded");
        _mint(to, amount);
    }

    /// @notice Burn points from a user. Only burner role.
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /// @notice Enable transfers globally (for TGE). Irreversible.
    function enableTransfers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        transfersEnabled = true;
        emit TransfersEnabled();
    }

    /// @notice Whitelist an address for transfers before global enable.
    function setTransferWhitelist(address account, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        transferWhitelist[account] = status;
        emit TransferWhitelisted(account, status);
    }

    /// @dev Override transfer to enforce soulbound behavior.
    function _update(address from, address to, uint256 value) internal override {
        // Mint and burn are always allowed
        if (from != address(0) && to != address(0)) {
            require(
                transfersEnabled || transferWhitelist[from] || transferWhitelist[to],
                "TVP: transfers disabled"
            );
        }
        super._update(from, to, value);
    }
}
