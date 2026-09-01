// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TaskVaultPoints.sol";
import "../src/TaskVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address usdg = vm.envAddress("USDG_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy points token
        TaskVaultPoints points = new TaskVaultPoints(deployer);
        console.log("TaskVaultPoints deployed at:", address(points));

        // 2. Deploy main vault
        TaskVault vault = new TaskVault(
            address(points),
            usdg,
            treasury,
            deployer
        );
        console.log("TaskVault deployed at:", address(vault));

        // 3. Grant vault minter/burner roles
        points.grantRole(points.MINTER_ROLE(), address(vault));
        points.grantRole(points.BURNER_ROLE(), address(vault));
        console.log("Vault granted minter/burner roles");

        // 4. Verify deployment
        console.log("=== Deployment Summary ===");
        console.log("Network:", block.chainid == 46630 ? "Robinhood Testnet" : "Robinhood Mainnet");
        console.log("Points Token:", address(points));
        console.log("TaskVault:", address(vault));
        console.log("USDG:", usdg);
        console.log("Treasury:", treasury);
        console.log("Admin:", deployer);

        vm.stopBroadcast();
    }
}
