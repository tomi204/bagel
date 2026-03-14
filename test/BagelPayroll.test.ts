import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  employer: HardhatEthersSigner;
  employee: HardhatEthersSigner;
};

describe("BagelPayroll", function () {
  let signers: Signers;
  let payroll: any;
  let cerc20: any;
  let payrollAddress: string;
  let cerc20Address: string;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite requires mock FHE environment");
      this.skip();
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      employer: ethSigners[1],
      employee: ethSigners[2],
    };
  });

  beforeEach(async function () {
    // Deploy CERC20
    const CERC20Factory = await ethers.getContractFactory("CERC20");
    cerc20 = await CERC20Factory.deploy(
      1000000, // initialSupply
      "USDBagel",
      "USDB",
      ""
    );
    cerc20Address = await cerc20.getAddress();

    // Deploy BagelPayroll
    const PayrollFactory = await ethers.getContractFactory("BagelPayroll");
    payroll = await PayrollFactory.deploy();
    payrollAddress = await payroll.getAddress();

    // Configure confidential token
    await payroll.configureConfidentialToken(cerc20Address);
  });

  describe("Deployment", function () {
    it("should deploy with active vault", async function () {
      expect(await payroll.isActive()).to.be.true;
      expect(await payroll.nextBusinessIndex()).to.equal(0);
    });

    it("should have confidential token configured", async function () {
      expect(await payroll.confidentialToken()).to.equal(cerc20Address);
    });
  });

  describe("Business Registration", function () {
    it("should register a business with encrypted employer ID", async function () {
      // Encrypt employer ID hash
      const employerIdHash = 123456789;
      const encrypted = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(employerIdHash)
        .encrypt();

      const tx = await payroll
        .connect(signers.employer)
        .registerBusiness(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      const [nextEmpIdx, active] = await payroll.getBusinessInfo(0);
      expect(active).to.be.true;
      expect(nextEmpIdx).to.equal(0);
      expect(await payroll.nextBusinessIndex()).to.equal(1);
    });
  });

  describe("Employee Management", function () {
    beforeEach(async function () {
      // Register a business first
      const encrypted = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(123456789)
        .encrypt();

      await (
        await payroll
          .connect(signers.employer)
          .registerBusiness(encrypted.handles[0], encrypted.inputProof)
      ).wait();
    });

    it("should add employee with encrypted salary", async function () {
      const employeeIdHash = 987654321;
      const salaryPerSecond = 100; // 100 units/sec

      const encrypted = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(employeeIdHash)
        .add64(salaryPerSecond)
        .encrypt();

      const tx = await payroll
        .connect(signers.employer)
        .addEmployee(
          0, // businessIndex
          encrypted.handles[0],
          encrypted.handles[1],
          encrypted.inputProof
        );
      await tx.wait();

      const [lastAction, active] = await payroll.getEmployeeInfo(0, 0);
      expect(active).to.be.true;
      expect(lastAction).to.be.gt(0);
    });

    it("should set employee address", async function () {
      // Add employee first
      const encrypted = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(987654321)
        .add64(100)
        .encrypt();

      await (
        await payroll
          .connect(signers.employer)
          .addEmployee(0, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof)
      ).wait();

      // Set employee address
      await (
        await payroll
          .connect(signers.employer)
          .setEmployeeAddress(0, 0, signers.employee.address)
      ).wait();
    });
  });

  describe("Deposit", function () {
    beforeEach(async function () {
      // Register business
      const enc = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(123)
        .encrypt();
      await (
        await payroll.connect(signers.employer).registerBusiness(enc.handles[0], enc.inputProof)
      ).wait();
    });

    it("should deposit encrypted amount", async function () {
      const depositAmount = 1000000;
      const encrypted = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(depositAmount)
        .encrypt();

      const tx = await payroll
        .connect(signers.employer)
        .deposit(0, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      // Verify encrypted balance exists
      const encBalance = await payroll.getEncryptedBalance(0);
      const clearBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        encBalance,
        payrollAddress,
        signers.employer
      );
      expect(clearBalance).to.equal(depositAmount);
    });
  });

  describe("Salary Accrual & Withdrawal", function () {
    beforeEach(async function () {
      // Register business
      const enc1 = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(123)
        .encrypt();
      await (
        await payroll.connect(signers.employer).registerBusiness(enc1.handles[0], enc1.inputProof)
      ).wait();

      // Deposit funds
      const enc2 = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(10000000)
        .encrypt();
      await (
        await payroll.connect(signers.employer).deposit(0, enc2.handles[0], enc2.inputProof)
      ).wait();

      // Add employee with salary of 100/sec
      const enc3 = await fhevm
        .createEncryptedInput(payrollAddress, signers.employer.address)
        .add64(987)
        .add64(100)
        .encrypt();
      await (
        await payroll
          .connect(signers.employer)
          .addEmployee(0, enc3.handles[0], enc3.handles[1], enc3.inputProof)
      ).wait();

      // Set employee address
      await (
        await payroll.connect(signers.employer).setEmployeeAddress(0, 0, signers.employee.address)
      ).wait();
    });

    it("should accrue salary over time", async function () {
      // Advance time by 100 seconds
      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine", []);

      const tx = await payroll.accrueSalary(0, 0);
      await tx.wait();

      // Check accrued balance (100 salary/sec * 100 sec = 10000)
      const encAccrued = await payroll.getEncryptedAccrued(0, 0);
      const clearAccrued = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        encAccrued,
        payrollAddress,
        signers.employee
      );
      // Allow some variance due to block timestamp
      expect(clearAccrued).to.be.gte(9900);
      expect(clearAccrued).to.be.lte(10200);
    });

    it("should reject withdrawal before MIN_WITHDRAW_INTERVAL", async function () {
      const enc = await fhevm
        .createEncryptedInput(payrollAddress, signers.employee.address)
        .add64(1000)
        .encrypt();

      await expect(
        payroll
          .connect(signers.employee)
          .requestWithdrawal(0, 0, enc.handles[0], enc.inputProof)
      ).to.be.revertedWithCustomError(payroll, "WithdrawTooSoon");
    });

    it("should process withdrawal after interval", async function () {
      // Advance time past MIN_WITHDRAW_INTERVAL and accrue
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);

      await (await payroll.accrueSalary(0, 0)).wait();

      // Advance time again past MIN_WITHDRAW_INTERVAL for withdrawal
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);

      // Withdraw
      const enc = await fhevm
        .createEncryptedInput(payrollAddress, signers.employee.address)
        .add64(1000)
        .encrypt();

      const tx = await payroll
        .connect(signers.employee)
        .requestWithdrawal(0, 0, enc.handles[0], enc.inputProof);
      await tx.wait();
    });
  });
});
