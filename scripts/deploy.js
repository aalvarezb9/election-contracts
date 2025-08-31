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

  const title = "Elección Presidencial 2025";
  await (await voting.createElection(title)).wait();
  const eid = await voting.currentElectionId();
  console.log("Election created:", eid.toString(), title);

  const candidates = [
    { name: "Juan Pérez",  imageURI: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSID_Astp9-pWM1UZ4gcO6vbMnOzneXX0ZfWw&s" },
    { name: "María López", imageURI: "https://www.laprensagrafica.com/__export/1750461000730/sites/prensagrafica/img/2025/06/20/gal.jpg_673822677.jpg" },
    { name: "Carlos Sánchez", imageURI: "https://www.fcbarcelona.com/photo-resources/2021/08/05/1a696bdf-2750-4f86-9564-4422faf50151/messi-2.jpg?width=1200&height=750" }
  ];
  for (const c of candidates) {
    await (await voting.addCandidate(eid, c.name, c.imageURI)).wait();
    console.log("Candidate added:", c.name, c.imageURI);
  }

  const artifact = await hre.artifacts.readArtifact("Voting");
  const out = { address: voting.address, abi: artifact.abi, chainId: hre.network.config.chainId || 31337 };
  const relayerPath = path.join(__dirname, "..", "..", "elections-relayer", "config", "contract.json");
  fs.mkdirSync(path.dirname(relayerPath), { recursive: true });
  fs.writeFileSync(relayerPath, JSON.stringify(out, null, 2));
  console.log("Wrote:", relayerPath);

  const fePath = path.join(__dirname, "..", "..", "elections-frontend", "src", "assets", "contract.json");
  fs.mkdirSync(path.dirname(fePath), { recursive: true });
  fs.writeFileSync(fePath, JSON.stringify(out, null, 2));
  console.log("Wrote:", fePath);
}

main().catch((e) => { console.error(e); process.exit(1); });
