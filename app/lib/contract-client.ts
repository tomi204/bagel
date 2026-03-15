/**
 * BagelPayroll Contract Client
 *
 * BagelPayroll + CERC20 contract interactions via ethers.js.
 * Provides typed methods for all payroll operations.
 */

import { Contract, BrowserProvider, type Signer, type ContractTransactionResponse } from "ethers";
import { encryptValue, encryptValues, encryptAddressAndValue } from "./fhevm";

// Contract addresses (from deployment)
const PAYROLL_ADDRESS =
  process.env.NEXT_PUBLIC_PAYROLL_ADDRESS || "";
const CERC20_ADDRESS =
  process.env.NEXT_PUBLIC_CERC20_ADDRESS || "";
const POOL_ADDRESS =
  process.env.NEXT_PUBLIC_POOL_ADDRESS || "";

// BagelPayroll ABI (minimal, only what frontend needs)
const PAYROLL_ABI = [
  // Admin
  "function configureConfidentialToken(address token) external",
  "function isActive() external view returns (bool)",
  "function confidentialToken() external view returns (address)",
  "function nextBusinessIndex() external view returns (uint256)",

  // Business
  "function registerBusiness(bytes32 encEmployerId, bytes calldata inputProof) external",
  "function deposit(uint256 businessIndex, bytes32 encAmount, bytes calldata inputProof) external",
  "function getBusinessInfo(uint256 businessIndex) external view returns (uint256 nextEmployeeIdx, bool active)",

  // Employee
  "function addEmployee(uint256 businessIndex, bytes32 encEmployeeId, bytes32 encSalary, bytes calldata inputProof) external",
  "function setEmployeeAddress(uint256 businessIndex, uint256 employeeIndex, address employeeAddress) external",
  "function accrueSalary(uint256 businessIndex, uint256 employeeIndex) external",
  "function getEmployeeInfo(uint256 businessIndex, uint256 employeeIndex) external view returns (uint256 lastAction, bool active)",

  // Withdrawal
  "function requestWithdrawal(uint256 businessIndex, uint256 employeeIndex, bytes32 encAmount, bytes calldata inputProof) external",

  // Encrypted handles (for decryption)
  "function getEncryptedBalance(uint256 businessIndex) external view returns (bytes32)",
  "function getEncryptedAccrued(uint256 businessIndex, uint256 employeeIndex) external view returns (bytes32)",
  "function getEncryptedSalary(uint256 businessIndex, uint256 employeeIndex) external view returns (bytes32)",

  // Events
  "event VaultInitialized(address indexed authority, uint256 timestamp)",
  "event BusinessRegistered(uint256 indexed entryIndex, uint256 timestamp)",
  "event FundsDeposited(uint256 indexed entryIndex, uint256 timestamp)",
  "event EmployeeAdded(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp)",
  "event WithdrawalProcessed(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp)",
  "event SalaryAccrued(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp)",
];

// CERC20 ABI (ERC7984 interface)
const CERC20_ABI = [
  "function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) external returns (bytes32)",
  "function confidentialTransferFrom(address from, address to, bytes32 encryptedAmount, bytes inputProof) external returns (bytes32)",
  "function confidentialBalanceOf(address account) external view returns (bytes32)",
  "function confidentialTotalSupply() external view returns (bytes32)",
  "function setOperator(address operator, uint48 until) external",
  "function isOperator(address holder, address spender) external view returns (bool)",
  "function mint(address to, uint64 amount) external",
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
];

/**
 * Get a connected BagelPayroll contract instance
 */
export function getPayrollContract(signer: Signer): Contract {
  return new Contract(PAYROLL_ADDRESS, PAYROLL_ABI, signer);
}

/**
 * Get a connected CERC20 contract instance
 */
export function getCerc20Contract(signer: Signer): Contract {
  return new Contract(CERC20_ADDRESS, CERC20_ABI, signer);
}

/**
 * Register a new business
 */
export async function registerBusiness(
  signer: Signer
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const address = await signer.getAddress();

  // Encrypt employer ID (hash of address)
  const idHash = BigInt("0x" + address.slice(2, 18));
  const encrypted = await encryptValue(PAYROLL_ADDRESS, address, idHash);

  return contract.registerBusiness(encrypted.handles[0], encrypted.inputProof);
}

/**
 * Deposit funds to a business
 */
export async function deposit(
  signer: Signer,
  businessIndex: number,
  amount: bigint
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const address = await signer.getAddress();

  const encrypted = await encryptValue(PAYROLL_ADDRESS, address, amount);

  return contract.deposit(
    businessIndex,
    encrypted.handles[0],
    encrypted.inputProof
  );
}

/**
 * Add an employee to a business
 */
export async function addEmployee(
  signer: Signer,
  businessIndex: number,
  employeeAddress: string,
  salaryPerSecond: bigint
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const callerAddress = await signer.getAddress();

  // Encrypt employee ID and salary
  const empIdHash = BigInt("0x" + employeeAddress.slice(2, 18));
  const encrypted = await encryptValues(PAYROLL_ADDRESS, callerAddress, [
    empIdHash,
    salaryPerSecond,
  ]);

  return contract.addEmployee(
    businessIndex,
    encrypted.handles[0],
    encrypted.handles[1],
    encrypted.inputProof
  );
}

/**
 * Set employee wallet address
 */
export async function setEmployeeAddress(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number,
  employeeAddress: string
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  return contract.setEmployeeAddress(
    businessIndex,
    employeeIndex,
    employeeAddress
  );
}

/**
 * Accrue salary for an employee
 */
export async function accrueSalary(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  return contract.accrueSalary(businessIndex, employeeIndex);
}

/**
 * Request withdrawal of accrued salary
 */
export async function requestWithdrawal(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number,
  amount: bigint
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const address = await signer.getAddress();

  const encrypted = await encryptValue(PAYROLL_ADDRESS, address, amount);

  return contract.requestWithdrawal(
    businessIndex,
    employeeIndex,
    encrypted.handles[0],
    encrypted.inputProof
  );
}

/**
 * Get business info
 */
export async function getBusinessInfo(
  signer: Signer,
  businessIndex: number
): Promise<{ nextEmployeeIndex: number; isActive: boolean }> {
  const contract = getPayrollContract(signer);
  const [nextEmpIdx, active] = await contract.getBusinessInfo(businessIndex);
  return {
    nextEmployeeIndex: Number(nextEmpIdx),
    isActive: active,
  };
}

/**
 * Get employee info
 */
export async function getEmployeeInfo(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number
): Promise<{ lastAction: number; isActive: boolean }> {
  const contract = getPayrollContract(signer);
  const [lastAction, active] = await contract.getEmployeeInfo(
    businessIndex,
    employeeIndex
  );
  return {
    lastAction: Number(lastAction),
    isActive: active,
  };
}

/**
 * Get next business index
 */
export async function getNextBusinessIndex(signer: Signer): Promise<number> {
  const contract = getPayrollContract(signer);
  return Number(await contract.nextBusinessIndex());
}

// ================================================================
// BagelPool (Privacy Pool)
// ================================================================

const POOL_ABI = [
  "function queueTransfer(bytes32 encRecipient, bytes32 encAmount, bytes calldata inputProof) external",
  "function queueLength() external view returns (uint256)",
  "function getTransferInfo(uint256 index) external view returns (address sender, uint256 timestamp, bool distributed)",
  "function minDelay() external view returns (uint256)",
  "event TransferQueued(uint256 indexed index, address indexed sender, uint256 timestamp)",
];

/**
 * Get a connected BagelPool contract instance
 */
export function getPoolContract(signer: Signer): Contract {
  return new Contract(POOL_ADDRESS, POOL_ABI, signer);
}

/**
 * Private transfer via the BagelPool.
 * 1. Ensures the pool is authorized as operator on CERC20
 * 2. Encrypts recipient address + amount
 * 3. Calls queueTransfer on the pool
 * 4. Registers the recipient with the TEE distributor API
 *
 * On-chain: sender → pool (encrypted amount, encrypted recipient)
 * Later:    pool → recipient (by TEE operator)
 */
export async function privateTransfer(
  signer: Signer,
  recipientAddress: string,
  amount: bigint
): Promise<{ txHash: string; queueIndex: number }> {
  if (!POOL_ADDRESS) {
    throw new Error("BagelPool address not configured (NEXT_PUBLIC_POOL_ADDRESS)");
  }

  const cerc20 = getCerc20Contract(signer);
  const pool = getPoolContract(signer);
  const senderAddress = await signer.getAddress();

  // 1. Ensure pool is authorized as operator (set for 30 days)
  const isOp = await cerc20.isOperator(senderAddress, POOL_ADDRESS);
  if (!isOp) {
    const until = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
    const approveTx = await cerc20.setOperator(POOL_ADDRESS, until);
    await approveTx.wait();
    console.log("[Pool] Approved pool as operator");
  }

  // 2. Encrypt recipient address (eaddress) and amount (euint64) together
  const encrypted = await encryptAddressAndValue(
    POOL_ADDRESS,
    senderAddress,
    recipientAddress,
    amount
  );

  // 3. Queue the transfer on-chain
  const currentQueueLen = Number(await pool.queueLength());
  const tx = await pool.queueTransfer(
    encrypted.handles[0], // encrypted recipient
    encrypted.handles[1], // encrypted amount
    encrypted.inputProof
  );
  await tx.wait();
  console.log("[Pool] Transfer queued, tx:", tx.hash);

  // 4. Register recipient with the TEE distributor
  // (off-chain mapping for hackathon — in production the TEE decrypts on-chain eaddress)
  try {
    await fetch("/api/distribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        queueIndex: currentQueueLen,
        recipient: recipientAddress,
      }),
    });
    console.log("[Pool] Registered recipient with distributor");
  } catch (err) {
    console.warn("[Pool] Failed to register with distributor (transfer still queued):", err);
  }

  return { txHash: tx.hash, queueIndex: currentQueueLen };
}

/**
 * Get pool status
 */
export async function getPoolStatus(signer: Signer): Promise<{
  queueLength: number;
  minDelay: number;
}> {
  if (!POOL_ADDRESS) return { queueLength: 0, minDelay: 0 };
  const pool = getPoolContract(signer);
  const [queueLen, minDelay] = await Promise.all([
    pool.queueLength(),
    pool.minDelay(),
  ]);
  return {
    queueLength: Number(queueLen),
    minDelay: Number(minDelay),
  };
}

// Re-export addresses for use in components
export { PAYROLL_ADDRESS, CERC20_ADDRESS, POOL_ADDRESS };
