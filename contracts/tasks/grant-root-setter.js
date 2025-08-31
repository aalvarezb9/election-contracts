task("grant-root-setter", "Concede ROOT_SETTER_ROLE a una address")
  .addParam("addr", "Address a autorizar")
  .setAction(async ({ addr }, hre) => {
    const [owner] = await hre.ethers.getSigners();
    const json = require("../../deploy/Voting.json");
    const c = new hre.ethers.Contract(json.address, json.abi, owner);
    const role = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("ROOT_SETTER_ROLE"));
    const tx = await c.grantRole(role, addr);
    await tx.wait();
    console.log("Granted ROOT_SETTER_ROLE to", addr);
  });
