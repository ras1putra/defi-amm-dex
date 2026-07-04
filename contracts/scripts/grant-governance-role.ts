import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const masterChefAddress = "0x0343D7f221148fb348Fb358dEf392ad6283126c0";
  const governorAddress = "0xF1f790D1cAD04026828776f1Fcb9B89dA0F99691";
  
  // STAKING_ADMIN_ROLE
  const STAKING_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("STAKING_ADMIN_ROLE"));

  console.log(`Granting STAKING_ADMIN_ROLE to Governor (${governorAddress}) on V2MasterChef (${masterChefAddress})...`);

  const masterChef = await ethers.getContractAt("V2MasterChef", masterChefAddress);
  
  // Check if role is already granted
  const hasRole = await masterChef.hasRole(STAKING_ADMIN_ROLE, governorAddress);
  if (hasRole) {
    console.log("Governor already has STAKING_ADMIN_ROLE!");
    return;
  }

  const tx = await masterChef.grantRole(STAKING_ADMIN_ROLE, governorAddress);
  console.log("Transaction hash:", tx.hash);

  await tx.wait();
  console.log("Role successfully granted to Governor!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
