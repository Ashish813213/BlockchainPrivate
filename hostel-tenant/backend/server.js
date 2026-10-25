const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ROOT = path.join(__dirname, "..");
const DEPLOYMENT_FILE = path.join(ROOT, "deployments", "localhost.json");

function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) throw new Error(`Missing ${DEPLOYMENT_FILE}. Run: npm run node, then npm run deploy`);
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

function loadArtifact(name) {
  const file = path.join(ROOT, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing artifact for ${name}. Run: npm run compile`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const deployment = loadDeployment();
const artifact = loadArtifact("Hostel");
const provider = new ethers.JsonRpcProvider(RPC_URL);
const hostel = new ethers.Contract(deployment.contracts.Hostel.address, artifact.abi, provider);

async function signerFor(preferred) {
  const accounts = await provider.send("eth_accounts", []);
  if (!accounts.length) throw new Error("No unlocked accounts on the node");
  if (!preferred) return provider.getSigner(accounts[0]);
  const found = accounts.find((a) => a.toLowerCase() === preferred.toLowerCase());
  if (!found) throw new Error(`Account ${preferred} is not unlocked on this node`);
  return provider.getSigner(found);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(ROOT, "frontend")));
app.use("/vendor", express.static(path.join(ROOT, "node_modules", "ethers", "dist")));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    res.status(500).json({ error: err.shortMessage || err.reason || err.message || "Request failed" });
  });

const roomToJson = (r) => ({
  id: Number(r.id),
  rent: ethers.formatEther(r.rent),
  rentWei: r.rent.toString(),
  occupied: r.occupied,
  tenantName: r.tenantName,
  tenant: r.tenant,
  monthsPaid: Number(r.monthsPaid),
  lastPayment: r.lastPayment > 0n ? Number(r.lastPayment) : null,
});

app.get("/api/status", wrap(async (_req, res) => {
  const [count, chainId, balance] = await Promise.all([
    hostel.roomCount(),
    provider.getNetwork().then((n) => Number(n.chainId)),
    hostel.balance(),
  ]);
  res.json({
    ok: true,
    rpcUrl: RPC_URL,
    chainId,
    blockNumber: await provider.getBlockNumber(),
    address: deployment.contracts.Hostel.address,
    deployer: deployment.deployer,
    owner: await hostel.owner(),
    roomCount: Number(count),
    contractBalance: ethers.formatEther(balance),
    deployedAt: deployment.deployedAt,
  });
}));

app.get("/api/abi", (_req, res) => res.json({ Hostel: artifact.abi, address: deployment.contracts.Hostel.address }));

app.get("/api/accounts", wrap(async (_req, res) => {
  const accounts = await provider.send("eth_accounts", []);
  res.json({
    accounts: await Promise.all(accounts.map(async (address) => ({
      address,
      eth: ethers.formatEther(await provider.getBalance(address)),
    }))),
  });
}));

app.get("/api/rooms", wrap(async (_req, res) => {
  const rooms = await hostel.getRooms();
  res.json({ rooms: rooms.map(roomToJson) });
}));

app.post("/api/rooms", wrap(async (req, res) => {
  const { rentEth, sender } = req.body || {};
  if (!rentEth) throw new Error("rentEth is required");
  const signer = await signerFor(sender);
  const tx = await hostel.connect(signer).addRoom(ethers.parseEther(String(rentEth)));
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, rentEth: String(rentEth) });
}));

app.post("/api/rooms/:id/occupy", wrap(async (req, res) => {
  const { tenant, tenantName, sender } = req.body || {};
  if (!tenant || !tenantName) throw new Error("tenant and tenantName are required");
  const signer = await signerFor(sender);
  const tx = await hostel.connect(signer).occupy(Number(req.params.id), ethers.getAddress(tenant), tenantName);
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, roomId: Number(req.params.id) });
}));

app.post("/api/rooms/:id/vacate", wrap(async (req, res) => {
  const signer = await signerFor(req.body?.sender);
  const tx = await hostel.connect(signer).vacate(Number(req.params.id));
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, roomId: Number(req.params.id) });
}));

app.post("/api/rooms/:id/pay", wrap(async (req, res) => {
  const { payer, sender } = req.body || {};
  const room = await hostel.getRoom(Number(req.params.id));
  if (!room.occupied) throw new Error("Room is empty");
  const who = ethers.getAddress(payer || sender || room.tenant);
  const signer = await signerFor(who);
  const tx = await hostel.connect(signer).payRent(Number(req.params.id), { value: room.rent });
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, roomId: Number(req.params.id), amount: ethers.formatEther(room.rent), payer: who });
}));

app.get("/api/payments", wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  const latest = await provider.getBlockNumber();
  const events = await hostel.queryFilter(hostel.filters.RentPaid(), Math.max(0, latest - 5000), latest);
  res.json({
    payments: events.slice(-limit).reverse().map((e) => ({
      hash: e.transactionHash,
      block: e.blockNumber,
      roomId: Number(e.args[0]),
      payer: e.args[1],
      amount: ethers.formatEther(e.args[2]),
      monthsPaid: Number(e.args[3]),
    })),
  });
}));

app.get("*", (_req, res) => res.sendFile(path.join(ROOT, "frontend", "index.html")));

app.listen(PORT, () => {
  console.log(`Hostel backend : http://localhost:${PORT}`);
  console.log(`Contract       : ${deployment.contracts.Hostel.address}`);
  console.log(`RPC            : ${RPC_URL}`);
});
