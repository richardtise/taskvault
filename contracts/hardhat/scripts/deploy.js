const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const usdgAddress = process.env.USDG_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!usdgAddress || !treasuryAddress) {
    throw new Error("Set USDG_ADDRESS and TREASURY_ADDRESS in .env");
  }

  // 1. Deploy TaskVaultPoints
  const Points = await ethers.getContractFactory("TaskVaultPoints");
  const points = await Points.deploy(deployer.address);
  await points.waitForDeployment();
  console.log("TaskVaultPoints deployed to:", await points.getAddress());

  // 2. Deploy TaskVault
  const Vault = await ethers.getContractFactory("TaskVault");
  const vault = await Vault.deploy(
    await points.getAddress(),
    usdgAddress,
    treasuryAddress,
    deployer.address
  );
  await vault.waitForDeployment();
  console.log("TaskVault deployed to:", await vault.getAddress());

  // 3. Grant roles
  await (await points.grantRole(await points.MINTER_ROLE(), await vault.getAddress())).wait();
  await (await points.grantRole(await points.BURNER_ROLE(), await vault.getAddress())).wait();
  console.log("Vault granted minter/burner roles");

  console.log("\n=== Deployment Summary ===");
  console.log("Points Token:", await points.getAddress());
  console.log("TaskVault:", await vault.getAddress());
  console.log("USDG:", usdgAddress);
  console.log("Treasury:", treasuryAddress);

  // 4. Verify (optional, if ETHERSCAN_API_KEY is set)
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting 30s for Blockscout indexing...");
    await new Promise(r => setTimeout(r, 30000));

    await hre.run("verify:verify", {
      address: await points.getAddress(),
      constructorArguments: [deployer.address],
    });

    await hre.run("verify:verify", {
      address: await vault.getAddress(),
      constructorArguments: [
        await points.getAddress(),
        usdgAddress,
        treasuryAddress,
        deployer.address,
      ],
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
