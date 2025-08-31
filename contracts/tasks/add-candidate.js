task("add-candidate", "Agrega candidato")
  .addParam("name", "Nombre")
  .setAction(async ({ name }, hre) => {
    const [acc] = await hre.ethers.getSigners();
    const json = require("../../deploy/Voting.json");
    const c = new hre.ethers.Contract(json.address, json.abi, acc);
    const eid = await c.currentElectionId();
    const tx = await c.addCandidate(eid, name);
    await tx.wait();
    console.log("Candidate added");
  });
