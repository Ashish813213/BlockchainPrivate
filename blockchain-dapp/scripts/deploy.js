const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log(`Deploying to chainId ${network.chainId} as ${deployer.address}`);

  const Token = await hre.ethers.getContractFactory("ChainToken");
  const token = await Token.deploy("Chain Token", "CTK", hre.ethers.parseUnits("1000000", 18));
  await token.waitForDeployment();

  const Poll = await hre.ethers.getContractFactory("Poll");
  const poll = await Poll.deploy();
  await poll.waitForDeployment();

  const seed = [
    ["Build a dApp", "Ship a full-stack blockchain application this quarter."],
    ["Run a hackathon", "Organize an internal hackathon focused on smart contracts."],
    ["Audit contracts", "Hire an external auditor for the core contracts."],
  ];
  for (const [title, description] of seed) {
    await (await poll.createProposal(title, description)).wait();
  }

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    rpcUrl: hre.network.config.url || "http://127.0.0.1:8545",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      ChainToken: {
        address: await token.getAddress(),
        startBlock: (await token.deploymentTransaction().blockNumber) ?? null,
      },
      Poll: {
        address: await poll.getAddress(),
      },
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log(`ChainToken: ${deployment.contracts.ChainToken.address}`);
  console.log(`Poll:        ${deployment.contracts.Poll.address}`);
  console.log(`Saved: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
