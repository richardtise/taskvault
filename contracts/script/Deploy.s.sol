// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TaskVaultPoints.sol";
import "../src/TaskVault.sol";
import "../src/mocks/MockUSDG.sol";

/// @notice Deploys TaskVaultPoints + TaskVault and wires up the minter/burner roles.
/// @dev Env:
///        PRIVATE_KEY       (required) deployer key
///        TREASURY_ADDRESS  (required) receives forfeited stream funds
///        USDG_ADDRESS      (optional) leave unset/zero to deploy MockUSDG — handy
///                          on a fresh testnet where no USDG exists yet.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address treasury = vm.envAddress("TREASURY_ADDRESS");
        require(treasury != address(0), "TREASURY_ADDRESS must be non-zero");

        // Unset or zero => deploy a 6-decimal mock so the stack is usable on a
        // fresh testnet. Set USDG_ADDRESS to use a real token.
        address usdg = vm.envOr("USDG_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        if (usdg == address(0)) {
            MockUSDG mock = new MockUSDG();
            usdg = address(mock);
            console.log("MockUSDG (test only) deployed at:", usdg);
        } else {
            console.log("Using existing USDG at:", usdg);
        }

        // 1. Deploy points token
        TaskVaultPoints points = new TaskVaultPoints(deployer);
        console.log("TaskVaultPoints deployed at:", address(points));

        // 2. Deploy main vault
        TaskVault vault = new TaskVault(address(points), usdg, treasury, deployer);
        console.log("TaskVault deployed at:", address(vault));

        // 3. Grant vault minter/burner roles
        points.grantRole(points.MINTER_ROLE(), address(vault));
        points.grantRole(points.BURNER_ROLE(), address(vault));
        console.log("Vault granted minter/burner roles");

        // 4. Verify deployment
        console.log("=== Deployment Summary ===");
        console.log("Network:", block.chainid == 46630 ? "Robinhood Testnet" : "Other/Mainnet");
        console.log("Points Token:", address(points));
        console.log("TaskVault:", address(vault));
        console.log("USDG:", usdg);
        console.log("Treasury:", treasury);
        console.log("Admin:", deployer);
        console.log(
            "NOTE: the deployer retains DEFAULT_ADMIN_ROLE, ADMIN_ROLE and VERIFIER_ROLE."
        );
        console.log(
            "      Move admin to a multisig and use a dedicated verifier key before mainnet."
        );

        vm.stopBroadcast();
    }
}
