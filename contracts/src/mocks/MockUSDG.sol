// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDG
/// @notice 6-decimal test stand-in for USDG. Lives in `src/` so `Deploy.s.sol`
///         can deploy it when USDG_ADDRESS is unset (fresh testnet). The Foundry
///         tests use it too. Do not deploy this to production.
contract MockUSDG is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Owner-less mint, for local/test setups only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Convenience faucet for testnet users: 1,000 mUSDG per call.
    function faucet() external {
        _mint(msg.sender, 1000 * 10 ** 6);
    }
}
