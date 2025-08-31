task("create-election", "Crea elección")
  .addParam("title", "Título")
  .setAction(async ({ title }, hre) => {
    const [acc] = await hre.ethers.getSigners();
    const json = require("../../deploy/Voting.json");
    const c = new hre.ethers.Contract(json.address, json.abi, acc);
    const tx = await c.createElection(title);
    await tx.wait();
    console.log("Election created");
  });
