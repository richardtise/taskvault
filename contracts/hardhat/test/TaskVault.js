const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TaskVault (Hardhat)", function () {
  let points, vault, usdg;
  let admin, treasury, verifier, user, referrer;

  beforeEach(async function () {
    [admin, treasury, verifier, user, referrer] = await ethers.getSigners();

    // Mock USDG
    const MockUSDG = await ethers.getContractFactory("MockUSDG");
    usdg = await MockUSDG.deploy();
    await usdg.waitForDeployment();

    // Points token
    const Points = await ethers.getContractFactory("TaskVaultPoints");
    points = await Points.deploy(admin.address);
    await points.waitForDeployment();

    // Vault
    const Vault = await ethers.getContractFactory("TaskVault");
    vault = await Vault.deploy(
      await points.getAddress(),
      await usdg.getAddress(),
      treasury.address,
      admin.address
    );
    await vault.waitForDeployment();

    // Roles
    await points.grantRole(await points.MINTER_ROLE(), await vault.getAddress());
    await points.grantRole(await points.BURNER_ROLE(), await vault.getAddress());
    await vault.grantRole(await vault.VERIFIER_ROLE(), verifier.address);

    // Fund user
    await usdg.mint(user.address, ethers.parseUnits("10000", 6));
    await usdg.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
  });

  it("Should register for free", async function () {
    await vault.connect(user).register(ethers.ZeroAddress);
    const info = await vault.getUserInfo(user.address);
    expect(info.exists).to.be.true;
  });

  it("Should complete task and mint points", async function () {
    await vault.connect(user).register(ethers.ZeroAddress);
    await vault.connect(verifier).completeTask(user.address, ethers.id("task1"), ethers.parseEther("100"), true);
    const info = await vault.getUserInfo(user.address);
    expect(info.tasksCompleted).to.equal(1);
    expect(info.balance).to.be.gt(0);
  });

  it("Should deposit to vault and get multiplier", async function () {
    await vault.connect(user).register(ethers.ZeroAddress);
    await vault.connect(user).depositToVault(ethers.parseUnits("500", 6));
    const info = await vault.getUserInfo(user.address);
    expect(info.vaultBalance).to.equal(ethers.parseUnits("500", 6));
    expect(info.vaultMultiplier).to.equal(5000); // +0.5x
  });

  it("Should create and claim stream", async function () {
    await vault.connect(user).register(ethers.ZeroAddress);
    await vault.connect(user).depositToVault(ethers.parseUnits("1000", 6));
    await vault.connect(user).createStream(ethers.parseUnits("500", 6), 90 * 24 * 60 * 60);

    // Warp 45 days
    await ethers.provider.send("evm_increaseTime", [45 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    const preBal = await usdg.balanceOf(user.address);
    await vault.connect(user).claimStream(0);
    const postBal = await usdg.balanceOf(user.address);
    expect(postBal - preBal).to.be.closeTo(ethers.parseUnits("250", 6), ethers.parseUnits("10", 6));
  });

  it("Should upgrade tier automatically", async function () {
    await vault.connect(user).register(ethers.ZeroAddress);
    for (let i = 0; i < 50; i++) {
      await vault.connect(verifier).completeTask(user.address, ethers.id(String(i)), ethers.parseEther("10"), true);
    }
    const info = await vault.getUserInfo(user.address);
    expect(info.tierIndex).to.equal(1); // Operator
  });

  it("Should award modality badges", async function () {
    await vault.connect(user).register(ethers.ZeroAddress);

    // Complete 20 robotics tasks with 100% accuracy
    for (let i = 0; i < 20; i++) {
      await vault.connect(verifier).completeTaskWithModality(
        user.address, 
        ethers.id(String(i)), 
        ethers.parseEther("10"), 
        true,
        ethers.id("robotics")
      );
    }

    const badge = await vault.getBadge(user.address, ethers.id("robotics"));
    expect(badge.level).to.equal(1); // Bronze
    expect(badge.tasksCompleted).to.equal(20);
  });
});
