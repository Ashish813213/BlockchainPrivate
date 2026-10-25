const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const PORT = process.env.PORT || 3002;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ROOT = path.join(__dirname, "..");
const deploymentFile = path.join(ROOT, "deployments", "localhost.json");
if (!fs.existsSync(deploymentFile)) throw new Error("Missing deployment. Run npm run deploy first.");
const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", "contracts", "Insurance.sol", "Insurance.json"), "utf8"));
const provider = new ethers.JsonRpcProvider(RPC_URL);
const insurance = new ethers.Contract(deployment.contracts.Insurance.address, artifact.abi, provider);

async function signerFor(address) {
  const accounts = await provider.send("eth_accounts", []);
  const found = address && accounts.find((a) => a.toLowerCase() === address.toLowerCase());
  if (!found) throw new Error(`Account ${address || ""} is not unlocked on this node`);
  return provider.getSigner(found);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(ROOT, "frontend")));
app.use("/vendor", express.static(path.join(ROOT, "node_modules", "ethers", "dist")));
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  res.status(500).json({ error: err.shortMessage || err.reason || err.message || "Request failed" });
});
const policyJson = (p) => ({
  id: Number(p.id),
  holder: p.holder,
  premium: ethers.formatEther(p.premium),
  coverage: ethers.formatEther(p.coverage),
  active: p.active,
  claimed: p.claimed,
});

app.get("/api/status", wrap(async (_req, res) => {
  res.json({
    chainId: Number((await provider.getNetwork()).chainId),
    blockNumber: await provider.getBlockNumber(),
    address: deployment.contracts.Insurance.address,
    owner: await insurance.owner(),
    policyCount: Number(await insurance.policyCount()),
    balance: ethers.formatEther(await insurance.balance()),
  });
}));
app.get("/api/accounts", wrap(async (_req, res) => {
  const accounts = await provider.send("eth_accounts", []);
  res.json({ accounts: await Promise.all(accounts.slice(0, 10).map(async (address) => ({ address, eth: ethers.formatEther(await provider.getBalance(address)) }))) });
}));
app.get("/api/policies", wrap(async (_req, res) => {
  res.json({ policies: (await insurance.getPolicies()).map(policyJson) });
}));
app.post("/api/policies", wrap(async (req, res) => {
  const { holder, coverage, premium } = req.body || {};
  if (!holder || !coverage || !premium) throw new Error("holder, coverage and premium are required");
  const signer = await signerFor(holder);
  const tx = await insurance.connect(signer).buyPolicy(ethers.parseEther(String(coverage)), { value: ethers.parseEther(String(premium)) });
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash });
}));
app.post("/api/policies/:id/claims", wrap(async (req, res) => {
  const { holder, amount } = req.body || {};
  if (!holder || !amount) throw new Error("holder and amount are required");
  const tx = await insurance.connect(await signerFor(holder)).submitClaim(Number(req.params.id), ethers.parseEther(String(amount)));
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash });
}));
app.post("/api/policies/:id/approve", wrap(async (req, res) => {
  const { owner, amount } = req.body || {};
  if (!owner || !amount) throw new Error("owner and amount are required");
  const tx = await insurance.connect(await signerFor(owner)).approveClaim(Number(req.params.id), ethers.parseEther(String(amount)));
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash });
}));
app.get("*", (_req, res) => res.sendFile(path.join(ROOT, "frontend", "index.html")));
app.listen(PORT, () => console.log(`Insurance backend: http://localhost:${PORT}`));
