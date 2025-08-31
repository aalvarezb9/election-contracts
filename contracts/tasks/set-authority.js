task("set-authority", "Setea autoridad")
  .addParam("addr", "address")
  .setAction(async ({ addr }, hre) => {
    const [acc] = await hre.ethers.getSigners();
    const json = require("../../deploy/Voting.json");
    const c = new hre.ethers.Contract(json.address, json.abi, acc);
    const tx = await c.setAuthority(addr);
    await tx.wait();
    console.log("Authority:", addr);
  });
