const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ROOT = path.join(__dirname, "..");
const DEPLOYMENT_FILE = path.join(ROOT, "deployments", "localhost.json");

function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Missing ${DEPLOYMENT_FILE}. Start a node and run: npm run deploy`);
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

function loadArtifact(name) {
  const file = path.join(ROOT, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing artifact for ${name}. Run: npm run compile`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const deployment = loadDeployment();
const tokenArtifact = loadArtifact("ChainToken");
const pollArtifact = loadArtifact("Poll");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const token = new ethers.Contract(deployment.contracts.ChainToken.address, tokenArtifact.abi, provider);
const poll = new ethers.Contract(deployment.contracts.Poll.address, pollArtifact.abi, provider);

const GAS_OPTS = { gasLimit: 300000n };

async function unlockedSigner(preferred) {
  const accounts = await provider.send("eth_accounts", []);
  if (!accounts.length) throw new Error("No unlocked accounts on the node");
  const wanted = preferred ? accounts.find((a) => a.toLowerCase() === preferred.toLowerCase()) : null;
  const address = wanted || accounts[0];
  if (preferred && !wanted) throw new Error(`Account ${preferred} is not unlocked on this node`);
  return provider.getSigner(address);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(ROOT, "frontend")));
app.use("/vendor", express.static(path.join(ROOT, "node_modules", "ethers", "dist")));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const message = err.shortMessage || err.reason || err.message || "Request failed";
    res.status(500).json({ error: message });
  });

app.get("/api/status", wrap(async (_req, res) => {
  const [blockNumber, chainId, net, totalSupply, proposalCount, owner] = await Promise.all([
    provider.getBlockNumber(),
    provider.getNetwork().then((n) => Number(n.chainId)),
    provider.send("net_version", []).catch(() => null),
    token.totalSupply(),
    poll.proposalCount(),
    token.owner(),
  ]);
  res.json({
    ok: true,
    rpcUrl: RPC_URL,
    blockNumber,
    chainId,
    netVersion: net,
    contracts: deployment.contracts,
    deployer: deployment.deployer,
    token: {
      name: await token.name(),
      symbol: await token.symbol(),
      decimals: Number(await token.decimals()),
      totalSupply: ethers.formatUnits(totalSupply, 18),
      owner,
    },
    proposalCount: Number(proposalCount),
    deployedAt: deployment.deployedAt,
  });
}));

app.get("/api/abi", (_req, res) => {
  res.json({
    ChainToken: tokenArtifact.abi,
    Poll: pollArtifact.abi,
    addresses: deployment.contracts,
  });
});

app.get("/api/accounts", wrap(async (_req, res) => {
  const accounts = await provider.send("eth_accounts", []);
  const withBalances = await Promise.all(
    accounts.map(async (address) => ({
      address,
      eth: ethers.formatEther(await provider.getBalance(address)),
      token: ethers.formatUnits(await token.balanceOf(address), 18),
    }))
  );
  res.json({ accounts: withBalances });
}));

app.get("/api/token/balance/:address", wrap(async (req, res) => {
  const address = ethers.getAddress(req.params.address);
  const [balance, eth] = await Promise.all([
    token.balanceOf(address),
    provider.getBalance(address),
  ]);
  res.json({
    address,
    token: ethers.formatUnits(balance, 18),
    eth: ethers.formatEther(eth),
  });
}));

app.post("/api/token/transfer", wrap(async (req, res) => {
  const { from, to, amount } = req.body || {};
  if (!from || !to || !amount) throw new Error("from, to and amount are required");
  const toAddr = ethers.getAddress(to);
  const value = ethers.parseUnits(String(amount), 18);
  const signer = await unlockedSigner(from);
  const tx = await token.connect(signer).transfer(toAddr, value, GAS_OPTS);
  const receipt = await tx.wait();
  res.json({
    ok: true,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    from: await signer.getAddress(),
    to: toAddr,
    amount: String(amount),
  });
}));

app.post("/api/token/mint", wrap(async (req, res) => {
  const { to, amount } = req.body || {};
  if (!to || !amount) throw new Error("to and amount are required");
  const signer = await unlockedSigner();
  const tx = await token.connect(signer).mint(ethers.getAddress(to), ethers.parseUnits(String(amount), 18), GAS_OPTS);
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, blockNumber: receipt.blockNumber, to, amount: String(amount) });
}));

app.get("/api/token/transfers", wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 2000);
  const events = await token.queryFilter(token.filters.Transfer(), fromBlock, latest);
  const rows = events
    .slice(-limit)
    .reverse()
    .map((e) => ({
      hash: e.transactionHash,
      block: e.blockNumber,
      from: e.args[0],
      to: e.args[1],
      value: ethers.formatUnits(e.args[2], 18),
    }));
  res.json({ count: rows.length, transfers: rows });
}));

app.get("/api/poll/proposals", wrap(async (_req, res) => {
  const proposals = await poll.getProposals();
  const total = await poll.totalVotes();
  res.json({
    totalVotes: Number(total),
    proposals: proposals.map((p, i) => ({
      id: i,
      title: p.title,
      description: p.description,
      votes: Number(p.votes),
    })),
  });
}));

app.post("/api/poll/proposals", wrap(async (req, res) => {
  const { title, description } = req.body || {};
  if (!title) throw new Error("title is required");
  const signer = await unlockedSigner();
  const tx = await poll.connect(signer).createProposal(title, description || "", GAS_OPTS);
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, blockNumber: receipt.blockNumber, title });
}));

app.post("/api/poll/vote", wrap(async (req, res) => {
  const { proposalId, voter } = req.body || {};
  if (proposalId === undefined || proposalId === null) throw new Error("proposalId is required");
  const accounts = await provider.send("eth_accounts", []);
  const target = voter
    ? ethers.getAddress(voter)
    : accounts.length
      ? ethers.getAddress(accounts[0])
      : null;
  if (!target) throw new Error("No voter supplied and no unlocked accounts");
  const signer = await unlockedSigner(target);
  const already = await poll.hasVoted(target, Number(proposalId));
  if (already) throw new Error("Account has already voted on this proposal");
  const tx = await poll.connect(signer).vote(Number(proposalId), GAS_OPTS);
  const receipt = await tx.wait();
  res.json({ ok: true, hash: receipt.hash, blockNumber: receipt.blockNumber, proposalId: Number(proposalId), voter: target });
}));

app.get("/api/poll/voted/:address", wrap(async (req, res) => {
  const address = ethers.getAddress(req.params.address);
  const count = await poll.proposalCount();
  const flags = [];
  for (let i = 0; i < Number(count); i++) flags.push(await poll.hasVoted(address, i));
  res.json({ address, hasVoted: flags });
}));

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Backend  : http://localhost:${PORT}`);
  console.log(`RPC      : ${RPC_URL}`);
  console.log(`Token    : ${deployment.contracts.ChainToken.address}`);
  console.log(`Poll     : ${deployment.contracts.Poll.address}`);
});
