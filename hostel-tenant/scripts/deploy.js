const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  const [deployer] = signers;
  const network = await hre.ethers.provider.getNetwork();

  const Hostel = await hre.ethers.getContractFactory("Hostel");
  const hostel = await Hostel.deploy();
  await hostel.waitForDeployment();

  const rents = ["0.05", "0.05", "0.07", "0.07", "0.10", "0.12"];
  for (const rent of rents) {
    await (await hostel.addRoom(hre.ethers.parseEther(rent))).wait();
  }

  const tenants = [
    [signers[1], "Ravi Sharma"],
    [signers[2], "Aisha Khan"],
    [signers[3], "John Doe"],
  ];
  for (let i = 0; i < tenants.length; i++) {
    await (await hostel.occupy(i, tenants[i][0].address, tenants[i][1])).wait();
  }

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    rpcUrl: hre.network.config.url || "http://127.0.0.1:8545",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: { Hostel: { address: await hostel.getAddress() } },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log(`Hostel contract: ${deployment.contracts.Hostel.address}`);
  console.log(`Rooms seeded: ${rents.length} (3 occupied)`);
  console.log(`Saved: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
