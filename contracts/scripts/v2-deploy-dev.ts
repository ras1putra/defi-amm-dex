import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Deploying V2 AMM DEV Contracts with account:", deployer.address);

  const rewardTokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"

  // Deploy WETH
  console.log("Deploying WETH...");
  const WETHFactory = await ethers.getContractFactory("WETH");
  const weth = await WETHFactory.deploy();
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("WETH deployed at:", wethAddress);

  // Deploy Mock USDC Token
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
  const ownerAddress = signers[1].address;
  console.log("\nDeploying V2MasterChef...");
  const MasterChefFactory = await ethers.getContractFactory("V2MasterChef");
  const masterChef = await MasterChefFactory.deploy(ownerAddress);
  await masterChef.waitForDeployment();
  const masterChefAddress = await masterChef.getAddress();
  console.log("V2MasterChef deployed at:", masterChefAddress);

  // Grant STAKING_ADMIN_ROLE to Governor
  const governorAddress = "0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F";
  const STAKING_ADMIN_ROLE = ethers.id("STAKING_ADMIN_ROLE");
  console.log("Granting STAKING_ADMIN_ROLE to Governor...");
  const masterChefWithAdmin = masterChef.connect(signers[1]) as any;
  const grantTx = await masterChefWithAdmin.grantRole(STAKING_ADMIN_ROLE, governorAddress);
  await grantTx.wait();
  console.log("Granted STAKING_ADMIN_ROLE to Governor successfully!");

  // Write deployed addresses
  const outputFile = process.env.OUTPUT_FILE || "deployed-dex-addresses.txt";
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
    console.log("\nV2 AMM dev addresses written to:", outputFile);
  }

  console.log("\n=== V2 AMM DEV Deployment Summary ===");
  console.log("V2Factory:            ", factoryAddress);
  console.log("V2Router:             ", routerAddress);
  console.log("WETH:                 ", wethAddress);
  console.log("Mock USDC:            ", usdcAddress);
  console.log(`Reward Token (SURL):   `, rewardTokenAddress);
  console.log("V2MasterChef:           ", masterChefAddress);
  console.log("=====================================\n");
}

main().catch((error) => {
  console.error("V2 AMM Dev Deployment Failed:", error);
  process.exitCode = 1;
});
