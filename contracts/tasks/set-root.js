task("set-root", "Setea Merkle root")
  .addParam("root", "bytes32")
  .setAction(async ({ root }, hre) => {
    const [acc] = await hre.ethers.getSigners();
    const json = require("../../deploy/Voting.json");
    const c = new hre.ethers.Contract(json.address, json.abi, acc);
    const tx = await c.setCurrentElectionMerkleRoot(root);
    await tx.wait();
    console.log("Root set:", root);
  });
