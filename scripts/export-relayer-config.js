const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "deploy", "Voting.json");
const relayerPath = path.join(__dirname, "..", "..", "elections-relayer", "config", "contract.json");
const localPath   = path.join(__dirname, "..", "config", "contract.json");

if (!fs.existsSync(src)) { console.error("deploy/Voting.json not found"); process.exit(1); }
const data = fs.readFileSync(src, "utf8");
fs.mkdirSync(path.dirname(localPath), { recursive: true });
fs.writeFileSync(localPath, data);
try {
  fs.mkdirSync(path.dirname(relayerPath), { recursive: true });
  fs.writeFileSync(relayerPath, data);
  console.log("Wrote", relayerPath);
} catch {
  console.log("Wrote", localPath, "(relayer path not found)");
}
