const { ethers } = require("hardhat");

async function main() {
  const Factory = await ethers.getContractFactory("Voting");
  const contract = await Factory.deploy();
  await contract.deployed();
  console.log("Deployed at:", contract.address);
}

main().catch((e) => { console.error(e); process.exit(1); });
