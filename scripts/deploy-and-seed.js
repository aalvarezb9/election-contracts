/* scripts/deploy-and-seed.js */
// Node: CommonJS
// Reqs: hardhat, ethers (vía hre), fs, path, crypto
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const hre = require("hardhat");

// ---------- Config editable ----------
const ELECTION_TITLE = "Elección Presidencial 2025";
const CANDIDATES = ["Juan Pérez", "María López", "Carlos Sánchez", "Ana Torres", "Luis Gómez"];
const NUM_VOTERS = 50;       // cantidad total de votantes a generar
const DNI_START = 1;         // primer DNI (como string: "1", "2", ...)

const RELAYER_CONTRACT_JSON = path.join(__dirname, "..", "..", "elections-relayer", "config", "contract.json");
const FRONTEND_CONTRACT_JSON = path.join(__dirname, "..", "..", "elections-frontend", "src", "assets", "contract.json");
const RNP_DB_JSON = path.join(__dirname, "..", "..", "rnp-mock", "db.json");
const RNP_DEV_FP_JSON = path.join(__dirname, "..", "..", "rnp-mock", "dev_fingerprints.json"); // solo testing local

// Opcional: si ya tienes un root de Semaphore/Zupass y tu contrato expone setCurrentElectionGroupRoot(uint256),
// puedes pasarlo por env para dejarlo seteado en el deploy.
const GROUP_ROOT = process.env.GROUP_ROOT || "";

// ---------- Utils ----------
function ensureDirOf(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
function toHex32(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== 32) {
    throw new Error("toHex32: buffer must be 32 bytes");
  }
  return "0x" + buf.toString("hex");
}
function randHex32() {
  return toHex32(crypto.randomBytes(32));
}
function keccakHexUtf8(s) {
  // usamos ethers de HRE para ser consistentes con tu mock
  return hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(String(s)));
}
function hexToBuf32(hex) {
  const h = String(hex || "").replace(/^0x/, "");
  if (h.length !== 64) throw new Error("hexToBuf32: expected 32-byte hex");
  return Buffer.from(h, "hex");
}
function xor32(a, b) {
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) out[i] = a[i] ^ b[i];
  return out;
}

/**
 * Genera un registro { dni, salt, helper, tag } sin almacenar la huella.
 * - fingerprint (solo dev) se usa para derivar H = keccak256(fingerprint) (32 bytes)
 * - R = random(32)
 * - helper = R XOR H
 * - tag = keccak256(R)
 * - salt = random(32)
 */
function makeVoter(dni, fingerprint) {
  const H = hexToBuf32(keccakHexUtf8(fingerprint)); // 32 bytes derivado de la huella
  const R = crypto.randomBytes(32);
  const helper = xor32(R, H);
  const tag = hre.ethers.utils.keccak256(toHex32(R));
  const salt = randHex32();
  return {
    dni: String(dni),
    salt,
    helper: toHex32(helper),
    tag
  };
}

// genera N votantes: dni = "1".., fingerprint de prueba = "1111", "1112", ...
function generateVoters(n, startDni) {
  const records = [];
  const devMap = {}; // dni -> fingerprint (solo para testing local)
  for (let i = 0; i < n; i++) {
    const dni = String(startDni + i);
    const fingerprint = String(1111 + i); // huellas ficticias predecibles
    const rec = makeVoter(dni, fingerprint);
    records.push(rec);
    devMap[dni] = fingerprint;
  }
  return { records, devMap };
}

async function tryGetContractFactory() {
  // intenta VotingZK; si no existe, usa Voting (tu versión actual)
  try {
    return await hre.ethers.getContractFactory("VotingZK");
  } catch {
    return await hre.ethers.getContractFactory("Voting");
  }
}

// ---------- Main ----------
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  // 1) Deploy
  const Factory = await tryGetContractFactory();
  const voting = await Factory.deploy();
  await voting.deployed();
  console.log("Contract deployed to:", voting.address, `(${Factory.interface.fragments[0].name})`);

  // 2) Crear elección
  let tx = await voting.createElection(ELECTION_TITLE);
  await tx.wait();
  const eid = await voting.currentElectionId();
  console.log("Election created:", eid.toString(), ELECTION_TITLE);

  // 3) Agregar candidatos
  for (const name of CANDIDATES) {
    // algunas versiones de tu contrato piden electionId como 1er arg, otras no
    try {
      tx = await voting.addCandidate(eid, name);
    } catch {
      tx = await voting.addCandidate(name);
    }
    await tx.wait();
    console.log("Candidate added:", name);
  }

  // 4) (Opcional) setear group root de Semaphore si el contrato lo soporta y hay GROUP_ROOT definido
  if (GROUP_ROOT) {
    const hasFn = !!voting.interface.functions["setCurrentElectionGroupRoot(uint256)"];
    if (hasFn) {
      console.log("Setting group root (Semaphore):", GROUP_ROOT);
      tx = await voting["setCurrentElectionGroupRoot(uint256)"](GROUP_ROOT);
      await tx.wait();
      console.log("Group root set. tx:", tx.hash);
    } else {
      console.log("Contract has no setCurrentElectionGroupRoot(uint256); skipping group root set.");
    }
  }

  // 5) Exportar ABI + address (relayer y frontend)
  const artifact = await hre.artifacts.readArtifact(Factory.interface.fragments[0].name);
  const out = { address: voting.address, abi: artifact.abi };

  try {
    ensureDirOf(RELAYER_CONTRACT_JSON);
    fs.writeFileSync(RELAYER_CONTRACT_JSON, JSON.stringify(out, null, 2));
    console.log("Wrote:", RELAYER_CONTRACT_JSON);
  } catch (e) {
    console.warn("No pude escribir en elections-relayer/config/contract.json:", e.message);
  }

  try {
    ensureDirOf(FRONTEND_CONTRACT_JSON);
    fs.writeFileSync(FRONTEND_CONTRACT_JSON, JSON.stringify(out, null, 2));
    console.log("Wrote:", FRONTEND_CONTRACT_JSON);
  } catch (e) {
    console.warn("No pude escribir en elections-frontend/src/assets/contract.json:", e.message);
  }

  // 6) Generar rnp-mock/db.json con más votantes (sin huella)
  const { records, devMap } = generateVoters(NUM_VOTERS, DNI_START);

  try {
    ensureDirOf(RNP_DB_JSON);
    fs.writeFileSync(RNP_DB_JSON, JSON.stringify(records, null, 2));
    console.log(`Wrote ${records.length} voters ->`, RNP_DB_JSON);
  } catch (e) {
    console.warn("No pude escribir rnp-mock/db.json:", e.message);
  }

  // 7) (Solo DEV) guardar mapping dni->fingerprint para tus pruebas locales
  try {
    ensureDirOf(RNP_DEV_FP_JSON);
    fs.writeFileSync(RNP_DEV_FP_JSON, JSON.stringify(devMap, null, 2));
    console.log("Wrote dev fingerprints map (solo testing local):", RNP_DEV_FP_JSON);
  } catch (e) {
    console.warn("No pude escribir rnp-mock/dev_fingerprints.json:", e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
