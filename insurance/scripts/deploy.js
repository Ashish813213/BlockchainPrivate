const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const Insurance = await hre.ethers.getContractFactory("Insurance");
  const insurance = await Insurance.deploy();
  await insurance.waitForDeployment();

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    rpcUrl: hre.network.config.url || "http://127.0.0.1:8545",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: { Insurance: { address: await insurance.getAddress() } },
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`Insurance contract: ${deployment.contracts.Insurance.address}`);
  console.log(`Saved: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
