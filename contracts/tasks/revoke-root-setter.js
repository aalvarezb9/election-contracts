task("revoke-root-setter", "Revoca ROOT_SETTER_ROLE")
  .addParam("addr", "Address a revocar")
  .setAction(async ({ addr }, hre) => {
    const [owner] = await hre.ethers.getSigners();
    const json = require("../../deploy/Voting.json");
    const c = new hre.ethers.Contract(json.address, json.abi, owner);
    const role = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("ROOT_SETTER_ROLE"));
    const tx = await c.revokeRole(role, addr);
    await tx.wait();
    console.log("Revoked ROOT_SETTER_ROLE from", addr);
  });
