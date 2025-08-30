const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy();
  await voting.deployed();
  console.log("Voting deployed to:", voting.address);

  // Crear elección
  const title = "Elección Presidencial 2025";
  let tx = await voting.createElection(title);
  await tx.wait();
  const eid = await voting.currentElectionId();
  console.log("Election created:", eid.toString(), title);

  // Agregar candidatos
  const candidates = ["Juan Pérez", "María López", "Carlos Sánchez"];
  for (const name of candidates) {
    tx = await voting.addCandidate(eid, name);
    await tx.wait();
    console.log("Candidate added:", name);
  }

  // Exportar ABI + address para relayer y frontend
  const artifact = await hre.artifacts.readArtifact("Voting");
  const out = {
    address: voting.address,
    abi: artifact.abi
  };

  // 1) Para el relayer
  const relayerPath = path.join(__dirname, "..", "..", "elections-relayer", "config", "contract.json");
  try {
    fs.mkdirSync(path.dirname(relayerPath), { recursive: true });
    fs.writeFileSync(relayerPath, JSON.stringify(out, null, 2));
    console.log("Wrote:", relayerPath);
  } catch (e) {
    console.warn("No pude escribir en elections-relayer/config/contract.json, copia manualmente.");
  }

  // 2) Para el frontend
  const fePath = path.join(__dirname, "..", "..", "elections-frontend", "src", "assets", "contract.json");
  try {
    fs.mkdirSync(path.dirname(fePath), { recursive: true });
    fs.writeFileSync(fePath, JSON.stringify(out, null, 2));
    console.log("Wrote:", fePath);
  } catch (e) {
    console.warn("No pude escribir en elections-frontend/src/assets/contract.json, copia manualmente.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
