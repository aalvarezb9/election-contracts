// scripts/create-and-seed.js  (Hardhat + ethers v5)
require("dotenv").config();
const fs = require("fs");
const { ethers } = require("hardhat");

const ABI = [
  "function currentElectionId() view returns (uint256)",
  "function elections(uint256) view returns (uint256 id, string title, bool active)",
  "function createElection(string) external",
  "function getCandidatesCount() view returns (uint256)",
  "function addCandidate(uint256,string,string) external",
  "event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name, string imageURI)"
];

async function main() {
  const { CONTRACT_ADDRESS, ELECTION_TITLE } = process.env;
  if (!CONTRACT_ADDRESS) throw new Error("Falta CONTRACT_ADDRESS en .env");

  const [signer] = await ethers.getSigners();
  console.log("Signer:", await signer.getAddress());

  const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  // 1) Crear elección si no hay
  let eid = (await c.currentElectionId()).toNumber();
  if (eid === 0) {
    const title = ELECTION_TITLE || `Elección ${new Date().toISOString().slice(0,10)}`;
    console.log("Creando elección:", title);
    const tx = await c.createElection(title, { gasLimit: 300_000 });
    await tx.wait();
    eid = (await c.currentElectionId()).toNumber();
    console.log("ElectionId:", eid);
  } else {
    const e = await c.elections(eid);
    if (!e.active) throw new Error(`La elección ${eid} no está activa (actívala creando una nueva).`);
    console.log("Elección activa detectada:", eid, "-", e.title);
  }

  // 2) Sembrar candidatos
  const list = [
    { name: "Juan Pérez",  imageURI: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSID_Astp9-pWM1UZ4gcO6vbMnOzneXX0ZfWw&s" },
    { name: "María López", imageURI: "https://www.laprensagrafica.com/__export/1750461000730/sites/prensagrafica/img/2025/06/20/gal.jpg_673822677.jpg" },
    { name: "Carlos Sánchez", imageURI: "https://www.fcbarcelona.com/photo-resources/2021/08/05/1a696bdf-2750-4f86-9564-4422faf50151/messi-2.jpg?width=1200&height=750" }
  ];
  console.log(`Sembrando ${list.length} candidatos en electionId=${eid}…`);
  for (const it of list) {
    const tx = await c.addCandidate(eid, it.name, it.imageURI, { gasLimit: 300_000 });
    const rc = await tx.wait();
    const ev = rc.events?.find(e => e.event === "CandidateAdded");
    const cid = ev?.args?.candidateId?.toNumber();
    console.log(`+ ${it.name} (#${cid})  tx=${tx.hash}`);
  }

  const total = (await c.getCandidatesCount()).toNumber();
  console.log("Total candidatos ahora:", total);
}

main().catch(e => { console.error(e); process.exit(1); });
