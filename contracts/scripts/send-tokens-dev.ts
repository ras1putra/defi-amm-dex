import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error("Usage: npm run send-tokens:dev <recipient_address>");
    process.exit(1);
  }

  // Validate address format
  if (!hre.ethers.isAddress(recipient)) {
    console.error(`Error: Invalid Ethereum address format: ${recipient}`);
    process.exit(1);
  }

  const { ethers } = hre;
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log(`Target recipient address: ${recipient}`);

  // Load deployed addresses from file
  let filePath = "";
  const possiblePaths = [
    process.env.OUTPUT_FILE || "",
    "/shared/.dex.addresses",
    path.join(__dirname, "../deployed-dex-addresses.txt")
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    console.error("Error: Deployed addresses file not found. Checked locations:", possiblePaths);
    process.exit(1);
  }
  console.log(`Loading deployed addresses from: ${filePath}`);

  const fileContent = fs.readFileSync(filePath, "utf8");
  const addresses: { [key: string]: string } = {};
  fileContent.split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length === 2) {
      addresses[parts[0].trim()] = parts[1].trim();
    }
  });

  const usdcAddress = addresses["CONTRACT_DEX_USDC"];

  if (!usdcAddress) {
    console.error("Error: Could not find CONTRACT_DEX_USDC in address file");
    process.exit(1);
  }

  console.log(`USDC address: ${usdcAddress}`);

  // Send ETH (for gas)
  const ethBalance = await ethers.provider.getBalance(recipient);
  console.log(`Current ETH balance of recipient: ${ethers.formatEther(ethBalance)} ETH`);

  if (ethBalance < ethers.parseEther("5")) {
    console.log("Sending 10 ETH to recipient for gas...");
    const tx = await deployer.sendTransaction({
      to: recipient,
      value: ethers.parseEther("10"),
    });
    await tx.wait();
    console.log("ETH sent successfully!");
  } else {
    console.log("Recipient has sufficient ETH gas balance.");
  }

  // Mint Mock USDC
  console.log("\nMinting 100,000 Mock USDC to recipient...");
  const mockUsdc = await ethers.getContractAt("MockToken", usdcAddress, deployer);
  const usdcAmount = ethers.parseUnits("100000", 6); // USDC has 6 decimals
  const mintTx = await mockUsdc.mint(recipient, usdcAmount);
  await mintTx.wait();
  const usdcBal = await mockUsdc.balanceOf(recipient);
  console.log(`New USDC balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);

  // Transfer SURL (RewardToken) from Owner (signers[1])
  const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  console.log("\nSending 15,000,000 token to recipient...");
  const ownerWallet = signers[1];
  const rewardToken = await ethers.getContractAt("MockToken", tokenAddress, ownerWallet);
  const amount = ethers.parseUnits("15000000", 18); // 15M SURL
  const transferTx = await rewardToken.transfer(recipient, amount);
  await transferTx.wait();
  const bal = await rewardToken.balanceOf(recipient);
  console.log(`New balance: ${ethers.formatUnits(bal, 18)}`);

  console.log("\n=== Token Funding Complete ===");
}

main().catch((error) => {
  console.error("Token Funding Script Failed:", error);
  process.exitCode = 1;
});
