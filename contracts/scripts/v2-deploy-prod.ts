import { ethers } from "hardhat";
import * as fs from "fs";
import { CONTRACT_ADDRESSES } from "../config";

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Deploying V2 AMM Production Contracts with account:", deployer.address);

  const rewardToken = CONTRACT_ADDRESSES.token
  if (!rewardToken) {
    throw new Error("Missing CONTRACT_TOKEN env var");
  }
  console.log("Reward Token address:", rewardToken);

  // Deploy WETH
  console.log("\nDeploying WETH...");
  const WETHFactory = await ethers.getContractFactory("WETH");
  const weth = await WETHFactory.deploy();
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("WETH deployed at:", wethAddress);

  // Deploy Mock USDC
  console.log("\nDeploying Mock USDC token...");
  const MockTokenFactory = await ethers.getContractFactory("MockToken");
  const mockUsdc = await MockTokenFactory.deploy("USD Coin", "USDC", 6);
  await mockUsdc.waitForDeployment();
  const usdcAddress = await mockUsdc.getAddress();
  console.log("MockUSDC deployed at:", usdcAddress);

  // Deploy V2Factory
  console.log("\nDeploying V2Factory...");
  const V2FactoryFactory = await ethers.getContractFactory("V2Factory");
  const factory = await V2FactoryFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("V2Factory deployed at:", factoryAddress);

  // Deploy V2Router
  console.log("\nDeploying V2Router...");
  const V2RouterFactory = await ethers.getContractFactory("V2Router");
  const router = await V2RouterFactory.deploy(factoryAddress, wethAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("V2Router deployed at:", routerAddress);

  // Deploy V2MasterChef
  console.log("\nDeploying V2MasterChef...");
  const MasterChefFactory = await ethers.getContractFactory("V2MasterChef");
  const masterChef = await MasterChefFactory.deploy(deployer.address);
  await masterChef.waitForDeployment();
  const masterChefAddress = await masterChef.getAddress();
  console.log("V2MasterChef deployed at:", masterChefAddress);

  // Transfer ownership
  const ownerAddress = CONTRACT_ADDRESSES.stakingOwner;
  if (ownerAddress && ownerAddress !== deployer.address) {
    console.log(`\nTransferring MasterChefV2 ownership to ${ownerAddress}...`);
    const transferTx = await masterChef.transferOwnership(ownerAddress);
    await transferTx.wait();
    console.log("Ownership transferred");
  }

  // Write deployed addresses
  const outputFile = CONTRACT_ADDRESSES.outputFile;
  if (outputFile) {
    const envContent = [
      `CONTRACT_V2_FACTORY=${factoryAddress}`,
      `CONTRACT_V2_ROUTER=${routerAddress}`,
      `CONTRACT_WETH=${wethAddress}`,
      `CONTRACT_DEX_USDC=${usdcAddress}`,
      `CONTRACT_STAKING=${masterChefAddress}`,
      "",
    ].join("\n");
    fs.writeFileSync(outputFile, envContent);
    console.log("\nV2 AMM addresses written to:", outputFile);
  }

  console.log("\n=== V2 AMM Production Deployment Summary ===");
  console.log("V2Factory:            ", factoryAddress);
  console.log("V2Router:             ", routerAddress);
  console.log("WETH:                 ", wethAddress);
  console.log("Mock USDC:            ", usdcAddress);
  console.log("Reward Token:         ", rewardToken);
  console.log("V2MasterChef:         ", masterChefAddress);
  console.log("=============================================\n");
}

main().catch((error) => {
  console.error("V2 AMM Production Deployment Failed:", error);
  process.exitCode = 1;
});
