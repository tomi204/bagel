import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // 1. Deploy CERC20 (USDBagel confidential token)
  const deployedCERC20 = await deploy("CERC20", {
    from: deployer,
    log: true,
    args: [
      1000000,         // initialSupply (uint64) — 1M tokens (6 decimals)
      "USDBagel",      // name
      "USDB",          // symbol
      "",              // tokenURI
    ],
  });
  console.log(`CERC20 (USDBagel): `, deployedCERC20.address);

  // 2. Deploy BagelPayroll
  const deployedPayroll = await deploy("BagelPayroll", {
    from: deployer,
    log: true,
  });
  console.log(`BagelPayroll: `, deployedPayroll.address);

  // 3. Configure confidential token on payroll contract
  if (deployedPayroll.newlyDeployed) {
    const payroll = await hre.ethers.getContractAt("BagelPayroll", deployedPayroll.address);
    const tx = await payroll.configureConfidentialToken(deployedCERC20.address);
    await tx.wait();
    console.log(`Configured CERC20 on BagelPayroll`);
  }
};

export default func;
func.id = "deploy_bagel_payroll";
func.tags = ["CERC20", "BagelPayroll"];
